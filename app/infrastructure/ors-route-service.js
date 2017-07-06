angular.module('orsApp.route-service', [])
    .factory('orsRouteService', ['$q', '$http', 'orsUtilsService', 'orsLandmarkService', 'orsMapFactory', 'orsObjectsFactory', 'lists', 'ENV', ($q, $http, orsUtilsService, orsLandmarkService, orsMapFactory, orsObjectsFactory, lists, ENV) => {
        /**
         * Requests geocoding from ORS backend
         * @param {String} requestData: XML for request payload
         */
        let orsRouteService = {};
        orsRouteService.routesSubject = new Rx.BehaviorSubject({});
        orsRouteService.resetRoute = () => {
            orsRouteService.routeObj = {};
            orsRouteService.routesSubject.onNext([]);
            let action = orsObjectsFactory.createMapAction(2, lists.layers[1], undefined, undefined);
            orsMapFactory.mapServiceSubject.onNext(action);
            orsRouteService.DeColor();
        };
        orsRouteService.routingRequests = {};
        orsRouteService.routingRequests.requests = [];
        orsRouteService.routingRequests.clear = () => {
            for (let req of orsRouteService.routingRequests.requests) {
                if ('cancel' in req) req.cancel("Cancel last request");
            }
            orsRouteService.routingRequests.requests = [];
        };
        /**
         * Requests route from ORS backend
         * @param {String} requestData: XML for request payload
         */
        orsRouteService.fetchRoute = (requestData) => {
            var url = ENV.routing;
            var canceller = $q.defer();
            var cancel = (reason) => {
                canceller.resolve(reason);
            };
            var promise = $http.get(url, {
                    params: requestData,
                    timeout: canceller.promise
                })
                .then((response) => {
                    return response.data;
                });
            return {
                promise: promise,
                cancel: cancel
            };
        };
        orsRouteService.setCurrentRouteIdx = (idx) => {
            orsRouteService.currentRouteIdx = idx;
        };
        orsRouteService.getCurrentRouteIdx = () => {
            return orsRouteService.currentRouteIdx;
        };
        orsRouteService.DeEmph = () => {
            let action = orsObjectsFactory.createMapAction(2, lists.layers[2], undefined, undefined);
            orsMapFactory.mapServiceSubject.onNext(action);
        };
        orsRouteService.DeColor = () => {
            let action = orsObjectsFactory.createMapAction(2, lists.layers[7], undefined, undefined);
            orsMapFactory.mapServiceSubject.onNext(action);
        };
        orsRouteService.Emph = (geom) => {
            let action = orsObjectsFactory.createMapAction(1, lists.layers[2], geom, undefined, lists.layerStyles.routeEmph());
            orsMapFactory.mapServiceSubject.onNext(action);
        };        
        orsRouteService.EmphLandmark = (geom) => {
            let action = orsObjectsFactory.createMapAction(13, lists.layers[10], geom, undefined, lists.landmarkIconEmph);
            orsMapFactory.mapServiceSubject.onNext(action);
        };
        orsRouteService.DeEmphLandmark = () => {
            let action = orsObjectsFactory.createMapAction(2, lists.layers[10], undefined, undefined);
            orsMapFactory.mapServiceSubject.onNext(action);
        };
        orsRouteService.Color = (geom, color) => {
            let style = lists.layerStyles.getStyle(color, 6, 1);
            let action = orsObjectsFactory.createMapAction(1, lists.layers[7], geom, undefined, style);
            orsMapFactory.mapServiceSubject.onNext(action);
        };
        orsRouteService.zoomTo = (geom) => {
            let action = orsObjectsFactory.createMapAction(0, lists.layers[2], geom, undefined);
            orsMapFactory.mapServiceSubject.onNext(action);
        };
        orsRouteService.addRoute = (geometry, focusIdx) => {
            const routePadding = orsObjectsFactory.createMapAction(1, lists.layers[1], geometry, undefined, lists.layerStyles.routePadding());
            orsMapFactory.mapServiceSubject.onNext(routePadding);
            const routeLine = orsObjectsFactory.createMapAction(1, lists.layers[1], geometry, undefined, lists.layerStyles.route());
            orsMapFactory.mapServiceSubject.onNext(routeLine);
            if (focusIdx) {
                const zoomTo = orsObjectsFactory.createMapAction(0, lists.layers[1], geometry, undefined, undefined);
                orsMapFactory.mapServiceSubject.onNext(zoomTo);
            }
        };
        orsRouteService.addHeightgraph = (geometry) => {
            console.log(geometry)
            const heightgraph = orsObjectsFactory.createMapAction(-1, undefined, geometry, undefined, undefined);
            orsMapFactory.mapServiceSubject.onNext(heightgraph);
        };
        orsRouteService.removeHeightgraph = () => {
            const heightgraph = orsObjectsFactory.createMapAction(-1, undefined, undefined, undefined, undefined);
            orsMapFactory.mapServiceSubject.onNext(heightgraph);
        };
        /** prepare route to json */
        orsRouteService.processResponse = (data, profile, focusIdx, includeLandmarks) => {
            orsRouteService.data = data;
            let cnt = 0;
            angular.forEach(orsRouteService.data.routes, function(route) {
                console.error(route)
                //const geometry = orsUtilsService.decodePolyline(route.geometry, route.elevation);
                route.geometryRaw = angular.copy(route.geometry.coordinates);
                let geometry = route.geometry.coordinates;
                // reverse order, needed as leaflet ISO 6709
                for (let i = 0; i < geometry.length; i++) {
                    let lng = geometry[i][0];
                    let lat = geometry[i][1];
                    geometry[i][0] = lat;
                    geometry[i][1] = lng;
                }
                route.geometry = geometry;
                
                // landmark stuff here
                orsLandmarkService.clearAll();
                if(includeLandmarks) {
                    const lmPayload = orsLandmarkService.prepareQuery(route.geometry, route.segments);
                       
                    const lmRequest = orsLandmarkService.promise(lmPayload);
                    lmRequest.promise.then(function(response) {        
                        // save to route object ...
                        // attach the landmarks to the corresponding segment
                        
                        var lmCnt = 0;
                        for(var i=0; i<route.segments.length; i++) {
                            var segment = route.segments[i];

                            for(var j=1; j<segment.steps.length; j++) { // Don't attach to the start of the segment
                                var step = segment.steps[j];
                                step['landmarks'] = response[lmCnt];
                                // update the instruction
                                if(step.landmarks && step.landmarks.features && step.landmarks.features.length > 0) {
                                    // show the feature in the instruction
                                    var lm = step.landmarks.features[0];
                                    var instr = step.instruction;
                                    if(lm.properties.suitability > 0) {
                                        var lmStr = (lm.properties.position === 'before' ? 'after ' : 'before ') + 'the ' +
                                            (lm.properties.name && lm.properties.name !== 'Unknown' ? '&quot;' + lm.properties.name + '&quot; ' : '') + 
                                            lm.properties.type.replace(/_/, ' ');
                                        instr = instr + ' ' + lmStr;
                                        orsLandmarkService.addLandmark(lm);
                                    }
                                    step.instruction = instr;
                                } else {
                                    console.log("No landmarks found :(");
                                }
                                lmCnt = lmCnt + 1;
                            }
                        }   
                    }, function(response) {
                        console.error(response);
                    });
                }
                
                if (cnt == 0) {
                    if (route.elevation) {
                        // get max and min elevation from nested array
                        // var values = actionPackage.geometry.map(function(elt) {
                        //     return elt[2];
                        // });
                        // var max = Math.max.apply(null, values);
                        // var min = Math.min.apply(null, values);
                        // process heightgraph data
                        const hgGeojson = orsRouteService.processHeightgraphData(route);
                        orsRouteService.addHeightgraph(hgGeojson);
                    } else {
                        orsRouteService.removeHeightgraph();
                    }
                    orsRouteService.addRoute(geometry, focusIdx);
                }
                cnt += 1;
            });
            orsRouteService.routesSubject.onNext(orsRouteService.data);
        };
        /* process heightgraph geojson object */
        orsRouteService.processHeightgraphData = (route) => {
            const routeString = route.geometryRaw;
            let hgData = [];
            for (let key in route.extras) {
                let extra = [];
                if (key !== 'waycategory') {
                    for (let item of route.extras[key].values) {
                        let chunk = {};
                        const from = item[0];
                        const to = item[1];
                        const geometry = routeString.slice(from, to + 1);
                        chunk.line = geometry;
                        const typenumber = item[2];
                        chunk.attributeType = typenumber;
                        extra.push(chunk);
                    }
                    extra = GeoJSON.parse(extra, {
                        LineString: 'line',
                        extraGlobal: {
                            'Creator': 'OpenRouteService.org',
                            'records': extra.length,
                            'summary': key
                        }
                    });
                    hgData.push(extra);
                }
            }
            return hgData;
        };
        return orsRouteService;
    }]);