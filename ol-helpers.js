// Openlayers preview module

if (typeof proj4 != "undefined" && proj4) {
    window.Proj4js = {
        Proj: function (code) {
            var shortCode = code.replace(
                /urn:ogc:def:crs:(\w+):(.*:)?(\w+)$/, "$1:$3"
            )
            return Proj4js.defs[shortCode] && proj4(Proj4js.defs[shortCode]);
        },
        defs: proj4.defs,
        transform: proj4
    };
}

if (window.Proj4js) {
    // add your projection definitions here
    // definitions can be found at http://spatialreference.org/ref/epsg/{xxxx}/proj4js/

    // warn : 31370 definition from spatialreference.org is wrong
    window.Proj4js.defs["EPSG:31370"] = "+proj=lcc +lat_1=51.16666723333333 +lat_2=49.8333339 +lat_0=90 +lon_0=4.367486666666666 +x_0=150000.013 +y_0=5400088.438 +ellps=intl +towgs84=-106.868628,52.297783,-103.723893,0.336570,-0.456955,1.842183,-1.2747 +units=m +no_defs";

    window.Proj4js.defs["EPSG:28992"] = "+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.999908 +x_0=155000 +y_0=463000 +ellps=bessel +units=m +towgs84=565.2369,50.0087,465.658,-0.406857330322398,0.350732676542563,-1.8703473836068,4.0812 +no_defs <>";
    window.Proj4js.defs["EPSG:3812"] = "+proj=lcc +lat_1=49.83333333333334 +lat_2=51.16666666666666 +lat_0=50.797815 +lon_0=4.359215833333333 +x_0=649328 +y_0=665262 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";

}

(function() {

    // Establish the root object, `window` in the browser, or `global` on the server.
    var root = this;
    var OL_HELPERS = root.OL_HELPERS = {}

    var $_ = _ // keep pointer to underscore, as '_' will may be overridden by a closure variable when down the stack

    var EPSG4326 = OL_HELPERS.EPSG4326 = new OpenLayers.Projection("EPSG:4326")
    var Mercator = OL_HELPERS.Mercator = new OpenLayers.Projection("EPSG:3857")

    var MAX_FEATURES = 300

    var context = {
        getColor: function(feature) {
            return (feature.data.RGB && "rgb("+feature.data.RGB+")") || "#5784BF"
        }
    };
    var template = {
        fillColor: "${getColor}", // using context.getColor(feature)
        fillOpacity: 0.1,
        //graphicOpacity: 1,
        strokeColor: "#2a6496",
        strokeWidth: 1,
        pointRadius: 5
    };
    var defaultStyleMap = OL_HELPERS.defaultStyleMap = new OpenLayers.StyleMap({
        'default': new OpenLayers.Style(template, {context: context}),
        'select': new OpenLayers.Style(_.extend({}, template, {fillOpacity: 0.4, strokeWidth: 2}), {context: context}),
        'temporary': new OpenLayers.Style(template, {context: context})
    })

    var originalXHR = OpenLayers.Request.XMLHttpRequest
    OpenLayers.Request.XMLHttpRequest = function () {
        var newXHR = new originalXHR()

        // [taken from @letmaik patch on ckanext-geoview]
        // monkey-patch OL2 to get CORS working properly
        // see https://github.com/ckan/ckanext-geoview/issues/28
        var oldSRH = newXHR.setRequestHeader
        newXHR.setRequestHeader = function (sName, sValue) {
            if (sName === 'X-Requested-With') return;
            oldSRH.call(newXHR, sName, sValue)
        }

        // override the XMLHttpRequest to enforce UTF-8 decoding
        // because some WFS respond with UTF-8 answers while advertising ISO encoding in the headers
        if (newXHR._object && newXHR._object.overrideMimeType) newXHR._object.overrideMimeType('text/xml; charset=UTF-8')
        return newXHR
    }
    $_.each(Object.keys(originalXHR), function (key) {
        OpenLayers.Request.XMLHttpRequest[key] = originalXHR[key]
    })


    OpenLayers.Strategy.BBOXWithMax = OpenLayers.Class(OpenLayers.Strategy.BBOX, {
        update: function (options) {
            var mapBounds = this.getMapBounds() || new OpenLayers.Bounds(-180, -90, 180, 90);

            var maxFeatures = this.layer.protocol && this.layer.protocol.maxFeatures

            if (mapBounds !== null && ((options && options.force) || ((this.layer.features && this.layer.features.length) >= maxFeatures) ||
                (this.layer.visibility && this.layer.calculateInRange() && this.invalidBounds(mapBounds)))) {
                this.calculateBounds(mapBounds);
                this.resolution = this.layer.map.getResolution();
                this.triggerRead(options);
            }
        }
    })

    OpenLayers.Layer.ArcgisVectorLayer = OpenLayers.Class(OpenLayers.Layer.Vector,
        {
            getDataExtent: function () {
                var bbox = this.layerDescr &&
                    (this.layerDescr.bounds ||
                        (this.layerDescr.latLongBoundingBox && new OpenLayers.Bounds(this.layerDescr.latLongBoundingBox)))
                return (bbox && bbox.clone().transform(EPSG4326, this.map.getProjectionObject()))
                    || OpenLayers.Layer.Vector.prototype.getDataExtent.call(this, arguments)
            }
        }
    )

    OpenLayers.Layer.WFSLayer = OpenLayers.Class(OpenLayers.Layer.Vector,
        {
            getDataExtent: function () {
                var bbox = this.ftDescr &&
                    (this.ftDescr.bounds || // WFS 1.1+
                        (this.ftDescr.latLongBoundingBox && new OpenLayers.Bounds(this.ftDescr.latLongBoundingBox))) // WFS 1.0
                return (bbox && bbox.clone().transform(EPSG4326, this.map.getProjectionObject()))
                    || OpenLayers.Layer.Vector.prototype.getDataExtent.call(this, arguments)
            }
        }
    )

    OpenLayers.Layer.WMSLayer = OpenLayers.Class(OpenLayers.Layer.WMS,
        {
            getDataExtent: function () {
                return (this.mlDescr &&
                    this.mlDescr.llbbox &&
                    new OpenLayers.Bounds(this.mlDescr.llbbox).clone().transform(EPSG4326, this.map.getProjectionObject()))
                    || OpenLayers.Layer.WMS.prototype.getDataExtent.call(this, arguments)
            }
        }
    )

    OpenLayers.Layer.WMTSLayer = OpenLayers.Class(OpenLayers.Layer.WMTS,
        {
            getDataExtent: function () {
                return (this.mlDescr &&
                    this.mlDescr.bounds &&
                    this.mlDescr.bounds.clone().transform(EPSG4326, this.map.getProjectionObject()))
                    || OpenLayers.Layer.WMTS.prototype.getDataExtent.call(this, arguments)
            }
        }
    )

    OpenLayers.Control.HilatsLayerSwitcher = OpenLayers.Class(OpenLayers.Control.LayerSwitcher,
        {
            /**
             * Constructor: OpenLayers.Control.LayerSwitcher
             *
             * Parameters:
             * options - {Object}
             */
            initialize: function(options) {
                OpenLayers.Control.LayerSwitcher.prototype.initialize.apply(this, arguments)
                this.baselayers = options.baselayers
            },

            redraw: function () {
                var map = this.map

                //if the state hasn't changed since last redraw, no need
                // to do anything. Just return the existing div.
                if (!this.checkRedraw()) {
                    return this.div;
                }

                //clear out previous layers
                this.clearLayersArray("base");
                this.clearLayersArray("data");

                var containsOverlays = false;
                var containsBaseLayers = false;

                // Save state -- for checking layer if the map state changed.
                // We save this before redrawing, because in the process of redrawing
                // we will trigger more visibility changes, and we want to not redraw
                // and enter an infinite loop.
                this.layerStates = this.map.layers.map(function (layer) {
                    return {
                        'name': layer.name,
                        'visibility': layer.visibility,
                        'inRange': layer.inRange,
                        'id': layer.id
                    };
                })

                var layers = this.map.layers.slice().filter(function (layer) {
                    return layer.displayInLayerSwitcher
                });
                if (!this.ascending) {
                    layers.reverse();
                }

                for (var i = 0; i < layers.length; i++) {
                    var layer = layers[i];
                    var baseLayer = layer.isBaseLayer;

                    if (baseLayer) containsBaseLayers = true;
                    else containsOverlays = true;

                    // only check a baselayer if it is *the* baselayer, check data
                    //  layers if they are visible
                    var checked = (baseLayer) ? (layer == this.map.baseLayer) : layer.getVisibility();

                    // create input element
                    var inputElem = document.createElement("input"),
                    // The input shall have an id attribute so we can use
                    // labels to interact with them.
                        inputId = OpenLayers.Util.createUniqueID(this.id + "_input_");

                    inputElem.id = inputId;
                    inputElem.name = (baseLayer) ? this.id + "_baseLayers" : layer.name;
                    inputElem.type = (baseLayer) ? "radio" : "checkbox";
                    inputElem.value = layer.name;
                    inputElem.checked = checked;
                    inputElem.defaultChecked = checked;
                    inputElem.className = "olButton";
                    inputElem._layer = layer.id;
                    inputElem._layerSwitcher = this.id;
                    inputElem.disabled = !baseLayer && !layer.inRange;

                    // create span
                    var labelSpan = document.createElement("label");
                    // this isn't the DOM attribute 'for', but an arbitrary name we
                    // use to find the appropriate input element in <onButtonClick>
                    labelSpan["for"] = inputElem.id;
                    OpenLayers.Element.addClass(labelSpan, "labelSpan olButton");
                    labelSpan._layer = layer.id;
                    labelSpan._layerSwitcher = this.id;
                    if (!baseLayer && !layer.inRange) {
                        labelSpan.style.color = "gray";
                    }
                    labelSpan.innerHTML = layer.title || layer.name;
                    labelSpan.style.verticalAlign = (baseLayer) ? "bottom"
                        : "baseline";


                    var thisLayer = layer
                    // snap to layer bbox action
                    var gotoExtentButton =
                        $("<span class='zoomToExtentIcon'>[]</span>")
                            .click(function() {
                                var bbox = thisLayer.getDataExtent() || thisLayer.getExtent()
                                //var transformedBbox = bbox.clone().transform(layer.projection, map.getProjection())
                                map.zoomToExtent(bbox)
                            })


                    var groupArray = (baseLayer) ? this.baseLayers
                        : this.dataLayers;
                    groupArray.push({
                        'layer': layer,
                        'inputElem': inputElem,
                        'labelSpan': labelSpan
                    });


                    var groupDiv = $((baseLayer) ? this.baseLayersDiv
                        : this.dataLayersDiv);
                    var subDiv = $("<div></div>").appendTo(groupDiv)
                    subDiv
                            .append($(inputElem))
                            .append($(labelSpan))
                    if (!baseLayer) subDiv.append(gotoExtentButton)
                }

                // if no overlays, dont display the overlay label
                this.dataLbl.style.display = (containsOverlays) ? "" : "none";

                // if no baselayers, dont display the baselayer label
                this.baseLbl.style.display = (containsBaseLayers) ? "" : "none";

                // hide baselayers list if multiple basemaps config
                if (this.baselayers && this.baselayers.length>1) {
                    this.baseLbl.style.display = "none";
                    this.baseLayersDiv.style.display = "none";
                }

                return this.div;
            }
        }
    );

    /**
     * Parse a comma-separated set of KVP, typically for URL query or fragments
     * @param url
     */
    var parseKVP = OL_HELPERS.parseKVP = function (kvpString) {
        var kvps = (kvpString && kvpString.split("&")) || []
        var kvpMap = {}
        kvps.forEach(function(val, idx) {
            var kv = val.split('=')
            kvpMap[kv[0].toLowerCase()] = kv[1]
        })

        return kvpMap
    }

    var kvp2string = OL_HELPERS.kvp2string = function (map) {
        var result = ""
        for (var key in map) {
            result += (result.length>0?'&':'') + key + "=" + map[key]
        }

        return result
    }

    /**
     * Parse a URL into path, query KVP , hash KVP
     * @param url
     */
    OL_HELPERS.parseURL = function (url) {
        var parts = url.split('?', 2)
        var path = parts[0]
        var query = parts.length > 1 && parts[1]
        var hash
        if (!query) {
            parts = path.split('#', 2)
            path = parts[0]
            hash = parts.length > 1 && parts[1]
        } else {
            parts = query.split('#', 2)
            query = parts[0]
            hash = parts.length > 1 && parts[1]
        }

        return {
            path: path,
            query: parseKVP(query),
            hash: parseKVP(hash)
        }
    }


    var parseArcGisDescriptor = function (url, callback, failCallback) {

        OpenLayers.Request.GET({
            url: url,
            params: {f: "pjson"},
            success: function (request) {
                callback(JSON.parse(request.responseText))
            },
            failure: failCallback || function () {
                alert("Trouble getting ArcGIS descriptor");
                OpenLayers.Console.error.apply(OpenLayers.Console, arguments);
            }
        });
    }

    var parseWFSCapas = function (url, callback, failCallback) {
        var wfsFormat = new OpenLayers.Format.WFSCapabilities();

        OpenLayers.Request.GET({
            url: url,
            params: {
                SERVICE: "WFS",
                REQUEST: "GetCapabilities"
            },
            success: function (request) {
                var doc = request.responseXML;
                if (!doc || !doc.documentElement) {
                    doc = request.responseText;
                }
                var capabilities = wfsFormat.read(doc)
                callback(capabilities)
            },
            failure: failCallback || function () {
                alert("Trouble getting capabilities doc");
                OpenLayers.Console.error.apply(OpenLayers.Console, arguments);
            }
        });
    }


    var parseWFSFeatureTypeDescr = function (url, ftName, ver, callback, failCallback) {
        var format = new OpenLayers.Format.WFSDescribeFeatureType()

        OpenLayers.Request.GET({
            url: url,
            params: {
                SERVICE: "WFS",
                REQUEST: "DescribeFeatureType",
                TYPENAME: ftName,
                VERSION: ver
            },
            success: function (request) {
                var doc = request.responseXML;
                if (!doc || !doc.documentElement) {
                    doc = request.responseText;
                }
                var descr = format.read(doc)
                callback(descr)
            },
            failure: failCallback || function () {
                alert("Trouble getting ft decription doc");
                OpenLayers.Console.error.apply(OpenLayers.Console, arguments);
            }
        });
    }

    var parseWMSCapas = function (url, callback, failCallback) {
        var wmsFormat = new OpenLayers.Format.WMSCapabilities();

        OpenLayers.Request.GET({
            url: url,
            params: {
                SERVICE: "WMS",
                REQUEST: "GetCapabilities"
            },
            success: function (request) {
                var doc = request.responseXML;
                if (!doc || !doc.documentElement) {
                    doc = request.responseText;
                }
                var capabilities = wmsFormat.read(doc)
                callback(capabilities)
            },
            failure: failCallback || function () {
                alert("Trouble getting capabilities doc");
                OpenLayers.Console.error.apply(OpenLayers.Console, arguments);
            }
        });
    }

    OL_HELPERS.parseWMTSCapas = function (url, callback, failCallback) {
        var wmtsFormat = new OpenLayers.Format.WMTSCapabilities();

        OpenLayers.Request.GET({
            url: url,
            params: {
                SERVICE: "WMTS",
                REQUEST: "GetCapabilities",
                VERSION: "1.0.0"
            },
            success: function (request) {
                var doc = request.responseXML;
                if (!doc || !doc.documentElement) {
                    doc = request.responseText;
                }
                var capabilities = wmtsFormat.read(doc)
                callback(capabilities)
            },
            failure: failCallback || function () {
                alert("Trouble getting capabilities doc");
                OpenLayers.Console.error.apply(OpenLayers.Console, arguments);
            }
        });
    }

    OL_HELPERS.createKMLLayer = function (url) {

        var kml = new OpenLayers.Layer.Vector("KML", {
            styleMap: defaultStyleMap,
            projection: EPSG4326,
            strategies: [new OpenLayers.Strategy.Fixed()],
            protocol: new OpenLayers.Protocol.HTTP({
                url: url,
                format: new OpenLayers.Format.KML({
                    extractStyles: true,
                    extractAttributes: true,
                    maxDepth: 2
                })
            })
        })

        return kml
    }

    OL_HELPERS.createGFTLayer = function (tableId, GoogleAPIKey) {
        return new OpenLayers.Layer.Vector(
            "GFT", {
                styleMap: defaultStyleMap,
                projection: EPSG4326,
                strategies: [new OpenLayers.Strategy.Fixed()],
                protocol: new OpenLayers.Protocol.Script({
                    url: "https://www.googleapis.com/fusiontables/v1/query",
                    params: {
                        sql: "select * from " + tableId,
                        key: GoogleAPIKey
                    },
                    format: new OpenLayers.Format.GeoJSON({
                        ignoreExtraDims: true,
                        read: function (json) {
                            var row, feature, atts = {}, features = [];
                            var cols = json.columns; // column names
                            for (var i = 0; i < json.rows.length; i++) {
                                row = json.rows[i];
                                feature = new OpenLayers.Feature.Vector();
                                atts = {};
                                for (var j = 0; j < row.length; j++) {
                                    // 'location's are json objects, other types are strings
                                    if (typeof row[j] === "object" && row[j].geometry) {
                                        feature.geometry = this.parseGeometry(row[j].geometry);
                                    } else {
                                        atts[cols[j]] = row[j];
                                    }
                                }
                                feature.data = atts;
                                // if no geometry, not much point in continuing with this row
                                if (feature.geometry) {
                                    features.push(feature);
                                }
                            }
                            return features;
                        }
                    }),
                    callbackKey: "callback"
                }),
                eventListeners: {
                    "featuresadded": function () {
                        this.map.zoomToExtent(this.getDataExtent());
                    }
                }
            })
    }

    OL_HELPERS.createGMLLayer = function (url) {

        var gml = new OpenLayers.Layer.Vector("GML", {
            styleMap: defaultStyleMap,
            strategies: [new OpenLayers.Strategy.Fixed()],
            protocol: new OpenLayers.Protocol.HTTP({
                url: url,
                format: new OpenLayers.Format.GML()
            })
        });

        //TODO styles

        return gml
    }

    /**
     * Removes OGC conflicting URL parameters (service, request, version) and fragment
     * @param url
     */
    OL_HELPERS.cleanOGCUrl = function (url) {
        var urlParts = OL_HELPERS.parseURL(url)
        delete urlParts.query['service']
        delete urlParts.query['request']
        delete urlParts.query['version']

        return urlParts.path + '?' + OL_HELPERS.kvp2string(urlParts.query)

    }

    OL_HELPERS.withFeatureTypesLayers = function (url, layerProcessor, ftName, map, useGET) {

        var deferredResult = $.Deferred()
        url = OL_HELPERS.cleanOGCUrl(url)
        parseWFSCapas(
            url,
            function (capas) {

                var ver = capas.version
                if (ver == "2.0.0") ver = "1.1.0"  // 2.0.0 causes failures in some cases (e.g. Geoserver TOPP States WFS)

                var candidates = capas.featureTypeList.featureTypes
                if (ftName) candidates = candidates.filter(function (ft) {
                    return ft.name == ftName
                })

                var deferredLayers = []

                $_.each(candidates, function (candidate, idx) {

                    var deferredLayer = $.Deferred()
                    deferredLayers.push(deferredLayer)

                    parseWFSFeatureTypeDescr(
                        url,
                            candidate.prefixedName || candidate.name,
                        ver,
                        function (descr) {
                            var ftLayer

                            if (descr.featureTypes) {

                                var srs;
                                var isLatLon = false;

                                if (candidate.srs) { // sometimes no default srs is found (misusage of DefaultSRS in 2.0 version, ...)

                                    var allSrs = (candidate.altSrs || []).concat([candidate.srs])

                                    // first look for 4326 projection
                                    if (allSrs.indexOf("EPSG:4326") >= 0)
                                        srs = new OpenLayers.Projection("EPSG:4326")
                                    else {
                                        for (var srsIdx = 0, length = allSrs.length; srsIdx < length; srsIdx++) {
                                            if (allSrs[srsIdx].match(/urn:ogc:def:crs:EPSG:.*:4326$/)) {
                                                srs = new OpenLayers.Projection(allSrs[srsIdx])
                                                break;
                                            }
                                        }
                                    }

                                    if (!srs) {
                                        // try current map projection
                                        if (map && map.getProjectionObject() && allSrs.indexOf(map.getProjectionObject().toString()) >= 0)
                                            srs = map.getProjectionObject()

                                        // fallback on layer projection, if supported
                                        else if (window.Proj4js && window.Proj4js.Proj(candidate.srs.toString()))
                                            srs = new OpenLayers.Projection(candidate.srs)
                                    }
                                }
                                if (!srs) {
                                    // no projection found --> try EPSG:4326 anyway, should be supported
                                    srs = new OpenLayers.Projection("EPSG:4326")
                                }

                                if (srs.toString().match(/urn:ogc:def:crs:EPSG:.*:4326$/) ||
                                    srs.getCode().startsWith("urn:ogc:def:crs:") && srs.proj.oProj && srs.proj.oProj.units == "degrees") {
                                    isLatLon = true // using long form SRS, assume it is lat/lon axis order
                                }



                                var geomProps = descr.featureTypes[0].properties.filter(function (prop) {
                                    return prop.type.startsWith("gml")
                                })

                                // ignore feature types with no gml prop. Correct ?
                                if (geomProps && geomProps.length > 0) {

                                    if (useGET) {
                                        var wfs_options = {
                                            url: url,
                                            //headers : {"Content-Type": "application/xml"},
                                            params: {
                                                request: "GetFeature",
                                                service: "WFS",
                                                version: ver,
                                                typeName: candidate.prefixedName || candidate.name,
                                                maxFeatures: MAX_FEATURES,
                                                srsName: srs,
                                                // TODO check capabilities for supported outputFormats
                                                //      some impls expose a long-form expression of GML2/3
                                                //outputFormat: "GML2"
                                            },
                                            format: new OpenLayers.Format.GML({
                                                featureNS: candidate.featureNS,
                                                geometryName: geomProps[0].name
                                            }),
                                            formatOptions : {
                                                xy: !isLatLon
                                            },
                                            srsInBBOX : true
                                        }

                                        ftLayer = new OpenLayers.Layer.Vector('WFS', {
                                            styleMap: defaultStyleMap,
                                            ftDescr: candidate,
                                            title: candidate.title,
                                            strategies: [new OpenLayers.Strategy.BBOXWithMax({maxFeatures: MAX_FEATURES, ratio: 1})],
                                            projection: srs,
                                            visibility: idx == 0,
                                            protocol: new OpenLayers.Protocol.HTTP(wfs_options)
                                        });
                                        ftLayer.getDataExtent = OpenLayers.Layer.WFSLayer.prototype.getDataExtent
                                    } else {
                                        ftLayer = new OpenLayers.Layer.WFSLayer(
                                            candidate.name, {
                                                styleMap: defaultStyleMap,
                                                ftDescr: candidate,
                                                title: candidate.title,
                                                strategies: [new OpenLayers.Strategy.BBOXWithMax({maxFeatures: MAX_FEATURES, ratio: 1})],
                                                projection: srs,
                                                visibility: idx == 0,
                                                protocol: new OpenLayers.Protocol.WFS({
                                                    //headers: {"Content-Type": "application/xml; charset=UTF-8"}, // (failed) attempt at dealing with accentuated chars in some feature types
                                                    version: ver,
                                                    url: url,
                                                    featureType: candidate.name,
                                                    srsName: srs,
                                                    //featurePrefix: descr.targetPrefix,
                                                    featureNS: descr.targetNamespace,
                                                    maxFeatures: MAX_FEATURES,
                                                    formatOptions : {
                                                        xy: !isLatLon
                                                    },
                                                    geometryName: geomProps[0].name,
                                                    //outputFormat: "GML2"  // enforce GML2, as GML3 uses lat/long axis order and discrepancies may exists between implementations (to be verified)
                                                })
                                            })
                                    }

                                    layerProcessor(ftLayer)
                                }
                            }

                            deferredLayer.resolve(ftLayer)
                        }
                    )
                })

                $.when.apply($, deferredLayers).done(function() {
                    deferredResult.resolve(deferredLayers)
                })

            }
        )

        return deferredResult;
    }


    OL_HELPERS.withWMSLayers = function (capaUrl, getMapUrl, layerProcessor, layerName, useTiling, map) {

        var deferredResult = $.Deferred()

        capaUrl = OL_HELPERS.cleanOGCUrl(capaUrl)
        getMapUrl = OL_HELPERS.cleanOGCUrl(getMapUrl)

        parseWMSCapas(
            capaUrl,
            function (capas) {

                var candidates = capas.capability.layers
                if (layerName) candidates = candidates.filter(function (layer) {
                    return layer.name == layerName
                })

                var ver = capas.version

                var deferredLayers = []

                $_.each(candidates, function (candidate, idx) {

                    var deferredLayer = $.Deferred()
                    deferredLayers.push(deferredLayer)

                    var mapLayer = new OpenLayers.Layer.WMSLayer(
                        candidate.name,
                        getMapUrl,
                        {layers: candidate.name,
                            transparent: true,
                            version: ver,
                            EXCEPTIONS:"INIMAGE"},
                        {mlDescr: candidate,
                            title: candidate.title,
                            baseLayer: false,
                            singleTile: !useTiling,
                            visibility: idx == 0,
                            projection: map ? map.getProjectionObject() : Mercator, // force SRS to 3857 if using OSM baselayer
                            ratio: 1,/*
                         protocol: new OpenLayers.Protocol.WMS({
                         version: ver,
                         url: url,
                         featureType: candidate.name,
                         srsName: map ? map.getProjectionObject() : Mercator,
                         featureNS: candidate.featureNS,
                         maxFeatures: MAX_FEATURES,
                         geometryName: geomProps[0].name
                         })
                         */
                        }
                    )

                    layerProcessor(mapLayer)

                    deferredLayer.resolve(mapLayer)
                })

                $.when.apply($, deferredLayers).done(function() {
                    deferredResult.resolve(deferredLayers)
                })

            }
        )

        return deferredResult;

    }


    OL_HELPERS.withWMTSLayers = function (capaUrl, layerProcessor, layerName, projection, resolutions) {

        var deferredResult = $.Deferred()

        capaUrl = OL_HELPERS.cleanOGCUrl(capaUrl)

        OL_HELPERS.parseWMTSCapas(
            capaUrl,
            function (capas) {

                var candidates = capas.contents.layers
                if (layerName) candidates = candidates.filter(function (layer) {
                    return layer.identifier == layerName
                })

                var ver = capas.version

                var deferredLayers = []

                $_.each(candidates, function (candidate, idx) {
                    var deferredLayer = $.Deferred()
                    deferredLayers.push(deferredLayer)

                    var mapLayer = new OpenLayers.Format.WMTSCapabilities().createLayer(
                        capas,
                        {
                            mlDescr: candidate,
                            name: candidate.title,
                            layer: candidate.identifier,
                            //format: "image/png",  // TODO take format from layer descriptor
                            isBaseLayer: false,
                            visibility: idx == 0,
                            projection : projection,
                            resolutions: resolutions,
                            //requestEncoding : "KVP" //TODO is this needed ?
                        }
                    );

                    mapLayer.getDataExtent = OpenLayers.Layer.WMTSLayer.prototype.getDataExtent

                    layerProcessor(mapLayer)

                    deferredLayer.resolve(mapLayer)
                })

                $.when.apply($, deferredLayers).done(function() {
                    deferredResult.resolve(deferredLayers)
                })

            }
        )

        return deferredResult;

    }


    OL_HELPERS.createGeoJSONLayer = function (url) {

        var geojson = new OpenLayers.Layer.Vector(
            "GeoJSON",
            {
                projection: EPSG4326,
                strategies: [new OpenLayers.Strategy.Fixed()],
                styleMap: defaultStyleMap,
                protocol: new OpenLayers.Protocol.HTTP({
                    url: url,
                    format: new OpenLayers.Format.GeoJSON()
                })
            });

        //TODO add styles

        return geojson
    }


    OL_HELPERS.createEsriGeoJSONLayer = function (url) {

        var esrijson = new OpenLayers.Layer.Vector(
            "Esri GeoJSON",
            {
                styleMap: defaultStyleMap,
                projection: EPSG4326,
                strategies: [new OpenLayers.Strategy.Fixed()],
                style: default_style,
                protocol: new OpenLayers.Protocol.Script({
                    url: url, //ArcGIS Server REST GeoJSON output url
                    format: new OpenLayers.Format.EsriGeoJSON(),
                    parseFeatures: function (data) {
                        return this.format.read(data);
                    }
                })
            });

        return esrijson
    }

    OL_HELPERS.withArcGisLayers = function (url, layerProcessor, layerName, layerBaseUrl) {

        parseArcGisDescriptor(
            url,
            function (descriptor) {

                if (descriptor.type == "Feature Layer") {
                    var newLayer = OL_HELPERS.createArcgisFeatureLayer(layerBaseUrl || url, descriptor, true)
                    layerProcessor(newLayer)
                } else if (descriptor.type == "Group Layer") {
                    // TODO intermediate layer
                } else if (!descriptor.type && descriptor.layers) {
                    var isFirst = true
                    $_.each(descriptor.layers, function (layer, idx) {
                        if (!layer.subLayerIds) {
                            var newLayer = OL_HELPERS.createArcgisFeatureLayer((layerBaseUrl || url) + "/" + layer.id, layer, isFirst)
                            layerProcessor(newLayer)
                            isFirst = false
                        }
                    })
                }

            }
        )
    }


    OL_HELPERS.createArcgisFeatureLayer = function (url, descriptor, visible) {

        //TODO fetch layer descriptor to extract extent
        var esrijson = new OpenLayers.Layer.ArcgisVectorLayer(
            descriptor.name,
            {
                layerDescr: descriptor,
                projection: EPSG4326,
                strategies: [new OpenLayers.Strategy.BBOXWithMax({maxFeatures: MAX_FEATURES, ratio: 1})],
                visibility: visible,
                styleMap: defaultStyleMap,
                protocol: new OpenLayers.Protocol.Script({
                    url: url +   //build ArcGIS Server query string
                        "/query?dummy=1&" +
                        //"geometry=-180%2C-90%2C180%2C90&" +
                        "geometryType=esriGeometryEnvelope&" +
                        "inSR=4326&" +
                        "spatialRel=esriSpatialRelIntersects&" +
                        "outFields=*&" +
                        "outSR=4326&" +
                        "returnGeometry=true&" +
                        "returnIdsOnly=false&" +
                        "returnCountOnly=false&" +
                        "returnZ=false&" +
                        "returnM=false&" +
                        "returnDistinctValues=false&" +
                        /*
                         "where=&" +
                         "text=&" +
                         "objectIds=&" +
                         "time=&" +
                         "relationParam=&" +
                         "maxAllowableOffset=&" +
                         "geometryPrecision=&" +
                         "orderByFields=&" +
                         "groupByFieldsForStatistics=&" +
                         "outStatistics=&" +
                         "gdbVersion=&" +
                         */
                        "f=pjson",
                    format: new OpenLayers.Format.EsriGeoJSON(),
                    maxFeatures: 1000,
                    parseFeatures: function (data) {
                        return this.format.read(data);
                    },
                    filterToParams: function (filter, params) {
                        var format = new OpenLayers.Format.QueryStringFilter({srsInBBOX: this.srsInBBOX})
                        var params = format.write(filter, params)
                        params.geometry = params.bbox
                        delete params.bbox

                        return params
                    }
                })
            });

        return esrijson
    }


    OL_HELPERS.displayFeatureInfo = function (map, layer, info, pixel) {
        info.css({
            left: pixel[0] + 'px',
            top: (pixel[1] - 15) + 'px'
        });
        map.getFeatures({
            pixel: pixel,
            layers: [layer],
            success: function (layerFeatures) {
                var feature = layerFeatures[0][0];
                if (feature) {
                    info.tooltip('hide')
                        .attr('data-original-title', feature.get('name'))
                        .tooltip('fixTitle')
                        .tooltip('show');
                } else {
                    info.tooltip('hide');
                }
            }
        });
    };

    OL_HELPERS.createLayerFromConfig = function(mapConfig, isBaseLayer, callback) {
        var urls;
        var attribution;


        if (mapConfig.type == 'osm') {

            var baseMapLayer = new OpenLayers.Layer.OSM(
                null,
                null,
                {
                    title: 'OSM Base Layer',
                    isBaseLayer: isBaseLayer,
                    transitionEffect: 'resize'
                }
            );

            callback (baseMapLayer);

        } else if (mapConfig.type == 'tms') {

            urls = mapConfig['url'];
            if (!urls)
                throw 'TMS URL must be set when using TMS Map type';
            var projection = mapConfig['srs'] ? new OpenLayers.Projection(mapConfig['srs']) : OL_HELPERS.Mercator // force SRS to 3857 if using OSM baselayer
            var maxExtent = mapConfig['extent'] && eval(mapConfig['extent'])

            var baseMapLayer = new OpenLayers.Layer.TMS('Base Layer', urls, {
                isBaseLayer: isBaseLayer,
                //wrapDateLine: true,
                projection: projection,
                maxExtent: maxExtent,
                attribution: mapConfig.attribution,
                // take lower left corner as default origin
                tileOrigin: new OpenLayers.LonLat(maxExtent[0], maxExtent[1]),
                //units:"m",
                layername:mapConfig['layername'],
                type:'png',
                resolutions: mapConfig['resolutions'] && eval(mapConfig['resolutions'])
                //zoomOffset: 5
            });

            callback (baseMapLayer);
        }  else if (mapConfig.type == 'XYZ') {
            // Custom XYZ layer
            urls = mapConfig['url'];
            if (!urls)
                throw 'URL must be set when using XYZ type';
            if (urls.indexOf('${x}') === -1) {
                urls = urls.replace('{x}', '${x}').replace('{y}', '${y}').replace('{z}', '${z}');
            }
            var baseMapLayer = new OpenLayers.Layer.XYZ('Base Layer', urls, {
                isBaseLayer: isBaseLayer,
                sphericalMercator: true,
                wrapDateLine: true,
                attribution: mapConfig.attribution
            });

            callback (baseMapLayer);
        }  else if (mapConfig.type == 'wmts') {

            OL_HELPERS.withWMTSLayers(
                mapConfig['url'],
                function(layer) {
                    layer.isBaseLayer = true
                    layer.options.attribution = mapConfig.attribution
                    layer.maxExtent = layer.mlDescr.bounds.clone().transform(OL_HELPERS.EPSG4326, layer.projection)

                    // force projection to be 4326 instead of CRS84, as tile matrix failed to be found properly otherwise
                    if (layer.projection.projCode == "OGC:CRS84")
                        layer.projection = OL_HELPERS.EPSG4326

                    callback (layer);
                },
                mapConfig['layer'],
                mapConfig['srs'],
                mapConfig['resolutions'] && eval(mapConfig['resolutions'])
            )

        } else if (mapConfig.type == 'wms') {
            urls = mapConfig['url'];
            if (!urls)
                throw 'WMS URL must be set when using WMS Map type';

            var useTiling = mapConfig['useTiling'] === undefined || mapConfig['useTiling']

            var baseMapLayer = new OpenLayers.Layer.WMSLayer(
                mapConfig['layer'],
                urls,
                {layers: mapConfig['layer'],
                    transparent: false,
                    srs : "EPSG:4326"},
                {
                    title: 'Base Layer',
                    isBaseLayer: true,
                    singleTile: !useTiling,
                    //tileSize : useTiling ? new OpenLayers.Size(512,512) : undefined,
                    visibility: true,
                    format: mapConfig['format'],
                    projection: mapConfig['srs'] ? new OpenLayers.Projection(mapConfig['srs']) : OL_HELPERS.Mercator, // force SRS to 3857 if using OSM baselayer
                    ratio: 1,
                    maxExtent: mapConfig['extent'] && eval(mapConfig['extent'])
                }
            )

            callback (baseMapLayer);

        }



    }

}) ();


