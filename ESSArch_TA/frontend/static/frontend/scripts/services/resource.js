angular.module('myApp').factory('Resource', function ($q, $filter, $timeout, listViewService, $rootScope) {

    //Get data for Events table
	function getEventPage(start, number, pageNumber, params, selected, sort) {
        var sortString = sort.predicate;
        if(sort.reverse) {
            sortString = "-"+sortString;
        }
        return listViewService.getEvents($rootScope.ip, pageNumber, number, sortString).then(function(value) {
            var eventCollection = value.data;
            eventCollection.forEach(function(event) {
                selected.forEach(function(item) {
                    if(item.id == event.id) {
                        event.class = "selected";
                    }
                });
            });
            return {
                data: eventCollection,
                numberOfPages: Math.ceil(value.count / number)
            };
        });
	}
    //Get data for IP table
    function getIpPage(start, number, pageNumber, params, selected, sort, state) {
        var sortString = sort.predicate;
        if(sort.reverse) {
            sortString = "-"+sortString;
        }
        return listViewService.getListViewData(pageNumber, number, sortString, state).then(function(value) {
            var ipCollection = value.data;
            ipCollection.forEach(function(ip) {
                if(selected.id == ip.id) {
                    ip.class = "selected";
                }
            });
            return {
                data: ipCollection,
                numberOfPages: Math.ceil(value.count / number)
            };
        });
	}
    function getReceptionIps(start, number, pageNumber, params, selected, checked, sort, state) {
        var sortString = sort.predicate;
        if(sort.reverse) {
            sortString = "-"+sortString;
        }
        return listViewService.getReceptionIps(pageNumber, number, sortString, state).then(function(value) {
            var ipCollection = value.data;
            ipCollection.forEach(function(ip) {
                ip.checked = false;
                checked.forEach(function(checkedIp) {
                    if(ip.id == checkedIp.id) {
                        ip.checked = true;
                    }
                });
                if(selected.id == ip.id) {
                    ip.class = "selected";
                }
            });
            return {
                data: ipCollection,
                numberOfPages: Math.ceil(value.count / number)
            };
        });
	}

	return {
		getEventPage: getEventPage,
        getIpPage: getIpPage,
        getReceptionIps: getReceptionIps,
	};

});
