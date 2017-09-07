/*
    ESSArch is an open source archiving and digital preservation system

    ESSArch Tools for Archive (ETA)
    Copyright (C) 2005-2017 ES Solutions AB

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program. If not, see <http://www.gnu.org/licenses/>.

    Contact information:
    Web - http://www.essolutions.se
    Email - essarch@essolutions.se
*/

angular.module('myApp').factory('listViewService', function (IP, IPReception, Event, Step, Task, EventType, $q, $http, $state, $log, appConfig, $rootScope, $filter, linkHeaderParser) {
    //Go to Given state
    function changePath(state) {
        $state.go(state);
    }
    //Gets data for list view i.e information packages
    function getListViewData(pageNumber, pageSize, filters, sortString, searchString, state) {
        return IP.query({
                page: pageNumber,
                page_size: pageSize,
                archival_institution: filters.institution,
                archivist_organization: filters.organization,
                other: filters.other,
                ordering: sortString,
                search: searchString,
                state: state
        }).$promise.then(function (resource) {
            count = resource.$httpHeaders('Count');
            if (count == null) {
                count = resource.length;
            }
            return {
                count: count,
                data: resource
            };
        });
    }

    function getReceptionIps(pageNumber, pageSize, filters, sortString) {
        return IPReception.query({
            page: pageNumber,
            page_size: pageSize,
            archival_institution: filters.institution,
            archivist_organization: filters.organization,
            ordering: sortString,
        }).$promise.then(function (resource) {
            count = resource.$httpHeaders('Count');
            if (count == null) {
                count = resource.length;
            }
            return {
                count: count,
                data: resource
            };
        });
    }

    //Get data for status view. child steps and tasks
    function getStatusViewData(ip, expandedNodes) {
        return IP.steps({
            id: ip.id
        }).$promise.then(function (resource) {
            var steps = resource;
            steps.forEach(function (step) {
                step.time_started = $filter('date')(step.time_created, "yyyy-MM-dd HH:mm:ss");
                step.children = [{ val: -1 }];
                step.childrenFetched = false;
            });
            return expandAndGetChildren(steps, expandedNodes);
        })
    }
    //Prepare the data for tree view in status view
    function getTreeData(row, expandedNodes) {
        return getStatusViewData(row, expandedNodes);
    }

    //Add a new event
    function addEvent(ip, eventType, eventDetail, outcome) {
        return Event.save({
            eventType: eventType.eventType,
            eventOutcomeDetailNote: eventDetail,
            eventOutcome: outcome.value,
            information_package: ip.id

        }).$promise.then(function (resource) {
            return resource;
        });
    }
    //Returns all events for one ip
    function getEvents(ip, pageNumber, pageSize, sortString) {
        return IP.events({
            id: ip.id,
            page: pageNumber,
            page_size: pageSize,
            ordering: sortString
        }).$promise.then(function (resource) {
            count = resource.$httpHeaders('Count');
            if (count == null) {
                count = resource.length;
            }
            return {
                count: count,
                data: resource
            };
        });
    }
    //Gets event type for dropdown selection
    function getEventlogData() {
        return EventType.query()
        .$promise.then(function (resource) {
            return resource;
        });
    }

    //Returns IP
    function getIp(id) {
        return IP.get({
            id: id
        }).then(function(data) {
            return data;
        });
    }

    //Get list of files in Ip
    function getFileList(ip) {
        var array = [];
        var tempElement = {
            filename: ip.object_path,
            created: ip.create_date,
            size: ip.object_size
        };
         array.push(tempElement);
         return array;
    }

    function getDir(ip, pathStr) {
        if(pathStr == "") {
            sendData = {};
        } else {
            sendData = {path: pathStr};
        }
        return IP.files(
            angular.extend({ id: ip.id }, sendData)
        ).$promise.then(function(data) {
            return data;
        });
    }

    function getFile(ip, path, file) {
        return IP.files({
            id: ip.id ,
            path: path + file.name
        }).$promise.then(function(response) {
            return response;
        });
    }

    /*******************/
    /*HELPER FUNCTIONS*/
    /*****************/

    // Takes an array of steps, expands the ones that should be expanded and
    // populates children recursively.
    function expandAndGetChildren(steps, expandedNodes) {
        var expandedObject = expand(steps, expandedNodes);
        var expanded = expandedObject.expandedSteps;
        steps = expandedObject.steps;
        expanded.forEach(function (item) {
            steps[item.stepIndex] = getChildrenForStep(steps[item.stepIndex], item.number).then(function (stepChildren) {
                var temp = stepChildren;
                temp.children = expandAndGetChildren(temp.children, expandedNodes);
                return temp;
            });
        });
        return steps;
    }

    // Set expanded to true for each item in steps that exists in expandedNodes
    // Returns updated steps and an array containing the expanded nodes
    function expand(steps, expandedNodes) {
        var expanded = [];
        expandedNodes.forEach(function (node) {
            steps.forEach(function (step, idx) {
                if (step.id == node.id) {
                    step.expanded = true;
                    expanded.push({ stepIndex: idx, number: node.page_number });
                }
            });
        });
        return { steps: steps, expandedSteps: expanded };
    }

    // Gets children for a step and processes each child step/task.
    // Returns the updated step
    function getChildrenForStep(step, page_number) {
        page_size = 10;
        if (angular.isUndefined(page_number) || !page_number) {
            step.page_number = 1;
        } else {
            step.page_number = page_number;
        }
        return Step.children({
            id: step.id,
                page: step.page_number,
                page_size: page_size,
                hidden: false
        }).$promise.then(function (resource) {
            var link = linkHeaderParser.parse(resource.$httpHeaders('Link'));
            var count = resource.$httpHeaders('Count');
            if (count == null) {
                count = resource.length;
            }
            step.pages = Math.ceil(count / page_size);
            link.next ? step.next = link.next : step.next = null;
            link.prev ? step.prev = link.prev : step.prev = null;
            step.page_number = page_number || 1;
            var placeholder_removed = false;
            if (resource.length > 0) {
                // Delete placeholder
                step.children.pop();
                placeholder_removed = true;
            }
            var tempChildArray = [];
            resource.forEach(function (child) {
                child.label = child.name;
                child.user = child.responsible;
                if (child.flow_type == "step") {
                    child.isCollapsed = false;
                    child.tasksCollapsed = true;
                    child.children = [{ val: -1 }];
                    child.childrenFetched = false;
                }
                tempChildArray.push(child);
            });
            step.children = tempChildArray;
            step.children = step.children.map(function (c) {
                c.time_started = $filter('date')(c.time_started, "yyyy-MM-dd HH:mm:ss");
                return c
            });
            return step;
        });
    }


    //Return child steps list and corresponding tasks on all levels of child steps
    function getChildSteps(childSteps) {
        var stepsToRemove = [];
        childSteps.forEach(function(child, idx){
            child.child_steps = getChildSteps(child.child_steps);
            var preserved_tasks = [];
            child.tasks.forEach(function(task){
                if (!task.hidden) {
                    task.user = task.responsible;
                    task.time_created = task.time_started;
                    task.isTask = true;
                    preserved_tasks.push(task);
                }
            });
            child.tasks = preserved_tasks;

            child.children = child.child_steps.concat(child.tasks);
            if(child.children.length == 0){
                stepsToRemove.push(idx);
            }
            child.isCollapsed = false;
            child.tasksCollapsed = true;

            child.children.sort(function(a, b){
                if(a.time_created != null && b.time_created == null) return -1;
                if(a.time_created == null && b.time_created != null) return 1;
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
        getChildrenForStep: getChildrenForStep,
        getListViewData: getListViewData,
        addEvent: addEvent,
        getEvents: getEvents,
        getTreeData: getTreeData,
        getStatusViewData: getStatusViewData,
        changePath: changePath,
        getEventlogData: getEventlogData,
        getIp: getIp,
        getDir: getDir,
        getFileList: getFileList,
        getReceptionIps: getReceptionIps,
        getFile: getFile,
    };

});

