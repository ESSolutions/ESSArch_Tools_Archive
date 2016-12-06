angular.module('myApp').factory('listViewService', function ($q, $http, $state, $log, appConfig, $rootScope, $filter) {
    //Go to Given state
    function changePath(state) {
        $state.go(state);
    }
    //Gets data for list view i.e information packages
    function getListViewData(pageNumber, pageSize, sortString, searchString, state) {
        var promise = $http({
            method: 'GET',
            url: appConfig.djangoUrl+'information-packages/',
            params: {
                page: pageNumber,
                page_size: pageSize,
                ordering: sortString,
                search: searchString,
                state: state
            }
        })
        .then(function successCallback(response) {
            count = response.headers('Count');
            if (count == null) {
                count = response.data.length;
            }
            return {
                count: count,
                data: response.data
            };
        }, function errorCallback(response){
        });
        return promise;
    }
    function getReceptionIps(pageNumber, pageSize, sortString, searchString, state) {
        var promise = $http({
            method: 'GET',
            url: appConfig.djangoUrl+'ip-reception/',
            params: {
                page: pageNumber,
                page_size: pageSize,
                ordering: sortString,
                search: searchString,
                state: state
            }
        })
        .then(function successCallback(response) {
            count = response.headers('Count');
            if (count == null) {
                count = response.data.length;
            }
            return {
                count: count,
                data: response.data
            };
        }, function errorCallback(response){
        });
        return promise;
    }
    //Get data for status view. child steps and tasks
    function getStatusViewData(ip, expandedNodes){
        var promise = $http({
            method: 'GET',
            url: ip.url + 'steps/',
        }).then(function(response){
            steps = response.data;
            steps.forEach(function(step){
                step.children = getChildSteps(step.child_steps);
                step.time_created = $filter('date')(step.time_created, "yyyy-MM-dd HH:mm:ss");
                step.tasks.forEach(function(task){
                    task.label = task.name;
                    task.user = task.responsible;
                    task.time_created = task.time_started;
                    task.isTask = true;
                });
                step.children = step.children.concat(step.tasks);
                step.children.sort(function(a, b){
                    var a = new Date(a.time_created),
                        b = new Date(b.time_created);

                    if(a < b) return -1;
                    if(a > b) return 1;
                    return 0;
                });
                step.children = step.children.map(function(c){
                    c.time_created = $filter('date')(c.time_created, "yyyy-MM-dd HH:mm:ss");
                    return c
                });
            });
            steps = setExpanded(steps, expandedNodes);
            return steps;
        });
        return promise;
    }
    //Prepare the data for tree view in status view
    function getTreeData(row, expandedNodes) {
        return getStatusViewData(row, expandedNodes);
    }
    //Add a new event
    function addEvent(ip, eventType, eventDetail, outcome) {
        var promise = $http({
            method: 'POST',
            url: appConfig.djangoUrl+"events/",
            data: {
                "eventType": eventType.id,
                "eventOutcomeDetailNote": eventDetail,
                "eventOutcome": outcome.value,
                "information_package": ip.id
            }

        }).then(function(response) {
            return response.data;
        }, function(){

        });
        return promise;
    }
    //Returns all events for one ip
    function getEvents(ip, pageNumber, pageSize, sortString) {
        var promise = $http({
            method: 'GET',
            url: ip.url+'events/',
            params: {page: pageNumber, page_size: pageSize, ordering: sortString}
        })
        .then(function successCallback(response) {
            count = response.headers('Count');
            if (count == null) {
                count = response.data.length;
            }
            return {
                count: count,
                data: response.data
            };
        }, function errorCallback(response){
        });
        return promise;
    }
    //Gets event type for dropdown selection
    function getEventlogData() {
        var promise = $http({
            method: 'GET',
            url: appConfig.djangoUrl+'event-types/'
        })
        .then(function successCallback(response) {
            return response.data;
        }, function errorCallback(response){
            alert(response.status);
        });
        return promise;

    }
    //Returns map structure for a profile
    function getStructure(profileUrl) {
        console.log(profileUrl)
        return $http({
            method: 'GET',
            url: profileUrl
        }).then(function(response) {
            console.log(response.data.structure);
            return response.data.structure;
        }, function(response) {
        });
    }
    //returns all SA-profiles and current as an object
    function getSaProfiles(ip) {
        var sas = [];
        var saProfile =
        {
            entity: "PROFILE_SUBMISSION_AGREEMENT",
            profile: null,
            profiles: [

            ],
        };
        var promise = $http({
            method: 'GET',
            url: appConfig.djangoUrl+'submission-agreements/'
        })
        .then(function successCallback(response) {
            sas = response.data;
            saProfile.profiles = [];
            saProfile.profileObjects = sas;
            sas.forEach(function (sa) {
                saProfile.profiles.push(sa);
                if (ip.SubmissionAgreement == sa.url){
                    saProfile.profile = sa;
                    saProfile.locked = ip.SubmissionAgreementLocked;
                }
            });
            return saProfile;
        }, function errorCallback(response){
            alert(response.status);
        });
        return promise;
    }

    function getProfileByTypeFromSA(sa, type){
        return sa['profile_' + type];
    }

    function getProfileByTypeFromIP(ip, type){
        return ip['profile_' + type];
    }

    function findProfileByUrl(url, profiles){
        var p = null;

        profiles.forEach(function(profile){
            if (profile.url == url){
                p = profile;
            }
        });

        return p;
    }

    function createProfileObj(type, profiles, sa, ip){
        var required = false;
        var locked = false;
        var url = null;

        p = getProfileByTypeFromIP(ip, type);
        if (p) {
            url_from_ip = p.profile;
            url = url_from_ip;
            locked = p.LockedBy ? true : false;
        }
        p = getProfileByTypeFromSA(sa, type);
        if (p){
            required = true;
            if (url == null) {
                url = p.profile;
            }
        }
        active = findProfileByUrl(url, profiles);
        checked = active == null ? false : true

        return {
            active: active,
            checked: checked,
            required: required,
            profiles: profiles,
            locked: locked
        };
    }

    //Returns an array consisting of profile objects for an SA
    function getSelectCollection(sa, ip) {
        if(sa == null) {
            var deferred = $q.defer();
            deferred.resolve([]);
            return deferred.promise;
        }
        return getIp(ip.url).then(function(value) {
            ip = value;
            if(sa.id != null) {
                var selectRowCollapse = {};
                var type = 'transfer_project';

                return getProfiles(type).then(function(profiles) {
                    selectRowCollapse[type] = createProfileObj(
                        type, profiles, sa, ip
                    );
                    return selectRowCollapse
                }).then(function(selectRowCollapse){
                    type = 'content_type';
                    return getProfiles(type).then(function(profiles) {
                        selectRowCollapse[type] = createProfileObj(
                            type, profiles, sa, ip
                        );
                        return selectRowCollapse
                    });
                }).then(function(selectRowCollapse){
                    type = 'data_selection';
                    return getProfiles(type).then(function(profiles) {
                        selectRowCollapse[type] = createProfileObj(
                            type, profiles, sa, ip
                        );
                        return selectRowCollapse
                    });
                }).then(function(selectRowCollapse){
                    type = 'classification';
                    return getProfiles(type).then(function(profiles) {
                        selectRowCollapse[type] = createProfileObj(
                            type, profiles, sa, ip
                        );
                        return selectRowCollapse
                    });
                }).then(function(selectRowCollapse){
                    type = 'import';
                    return getProfiles(type).then(function(profiles) {
                        selectRowCollapse[type] = createProfileObj(
                            type, profiles, sa, ip
                        );
                        return selectRowCollapse
                    });
                }).then(function(selectRowCollapse){
                    type = 'submit_description';
                    return getProfiles(type).then(function(profiles) {
                        selectRowCollapse[type] = createProfileObj(
                            type, profiles, sa, ip
                        );
                        return selectRowCollapse
                    });
                }).then(function(selectRowCollapse){
                    type = 'sip';
                    return getProfiles(type).then(function(profiles) {
                        selectRowCollapse[type] = createProfileObj(
                            type, profiles, sa, ip
                        );
                        return selectRowCollapse
                    });
                }).then(function(selectRowCollapse){
                    type = 'aip';
                    return getProfiles(type).then(function(profiles) {
                        selectRowCollapse[type] = createProfileObj(
                            type, profiles, sa, ip
                        );
                        return selectRowCollapse
                    });
                }).then(function(selectRowCollapse){
                    type = 'dip';
                    return getProfiles(type).then(function(profiles) {
                        selectRowCollapse[type] = createProfileObj(
                            type, profiles, sa, ip
                        );
                        return selectRowCollapse
                    });
                }).then(function(selectRowCollapse){
                    type = 'workflow';
                    return getProfiles(type).then(function(profiles) {
                        selectRowCollapse[type] = createProfileObj(
                            type, profiles, sa, ip
                        );
                        return selectRowCollapse
                    });
                }).then(function(selectRowCollapse){
                    type = 'preservation_metadata';
                    return getProfiles(type).then(function(profiles) {
                        selectRowCollapse[type] = createProfileObj(
                            type, profiles, sa, ip
                        );
                        return selectRowCollapse
                    });
                }).then(function(selectRowCollapse){
                    type = 'event';
                    return getProfiles(type).then(function(profiles) {
                        selectRowCollapse[type] = createProfileObj(
                            type, profiles, sa, ip
                        );
                        return selectRowCollapse
                    });
                });
            }
        })
    };
    //Execute prepare ip, which creates a new IP
    function prepareIp(label){
        return $http({
            method: 'POST',
            url: appConfig.djangoUrl+"information-packages/",
            data: {label: label}
        }).then(function (response){
            return "created";
        });

    }
    //Returns IP
    function getIp(url) {
        return $http({
            method: 'GET',
            url: url
        }).then(function(response) {
            return response.data;
        }, function(response) {
        });
    }
    //Returns SA
    function getSa(url) {
        return $http({
            method: 'GET',
            url: url
        }).then(function(response) {
            return response.data;
        }, function(response) {
        });
    }
    //Get list of files in Ip
    function getFileList(ip) {
        var array = [];
        var tempElement = {
            filename: ip.ObjectPath,
            created: ip.CreateDate,
            size: ip.ObjectSize
        };
         array.push(tempElement);
         return array;
    }
    /*******************/
    /*HELPER FUNCTIONS*/
    /*****************/
    function setExpanded(steps, expandedNodes) {
        expandedNodes.forEach(function(node) {
            steps.forEach(function(step) {
                if(step.id == node.id) {
                    step.expanded = true;
                }
                if(step.children != null){
                    if(step.children.length > 0){
                        setExpanded(step.children, expandedNodes);
                    }
                }
            });
        });
        return steps;

    }
    //Gets all profiles of a specific profile type for an IP
    function getProfiles(type){
        var promise = $http({
            method: 'GET',
            url: appConfig.djangoUrl+"profiles",
            params: {type: type}
        })
        .then(function successCallback(response) {
            return response.data;
        }, function errorCallback(response){
            alert(response.status);
        });
        return promise;
    };

    //Checks if a given sa is locked to a given ip
    function saLocked(sa, ip) {
        locked = false;
        ip.locks.forEach(function (lock) {
            if(lock.submission_agreement == sa.url){
                locked = true;
            }
        });
        return locked;
    }

    //Checks if a profile is locked
    function profileLocked(profileObject, sa, locks) {
        profileObject.locked = false;
        locks.forEach(function (lock) {
            if(lock.submission_agreement == sa && lock.profile == profileObject.profile.url){
                profileObject.locked = true;
            }
        });
        return profileObject;
    }
    //Return child steps list and corresponding tasks on all levels of child steps
    function getChildSteps(childSteps) {
        var stepsToRemove = [];
        childSteps.forEach(function(child, idx){
            child.child_steps = getChildSteps(child.child_steps);
            child.tasks.forEach(function(task){
                task.user = task.responsible;
                task.time_created = task.time_started;
                task.isTask = true;
            });

            child.children = child.child_steps.concat(child.tasks);
            if(child.children.length == 0){
                stepsToRemove.push(idx);
            }
            child.isCollapsed = false;
            child.tasksCollapsed = true;

            child.children.sort(function(a, b){
                var a = new Date(a.time_created),
                    b = new Date(b.time_created);

                if(a < b) return -1;
                if(a > b) return 1;
                return 0;
            });

            child.children = child.children.map(function(c){
                c.time_created = $filter('date')(c.time_created, "yyyy-MM-dd HH:mm:ss");
                return c
            });
        });
        stepsToRemove.forEach(function(idx){
            childSteps.splice(idx, 1);
        });
        return childSteps;
    }
    return {
        getListViewData: getListViewData,
        addEvent: addEvent,
        getEvents: getEvents,
        getTreeData: getTreeData,
        getStatusViewData: getStatusViewData,
        changePath: changePath,
        getEventlogData: getEventlogData,
        getSaProfiles: getSaProfiles,
        getSelectCollection: getSelectCollection,
        prepareIp: prepareIp,
        getIp: getIp,
        getSa: getSa,
        getFileList: getFileList,
        getStructure: getStructure,
        getReceptionIps: getReceptionIps
    };

});

