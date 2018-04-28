angular.module('myApp').factory('IP', function ($resource, appConfig, Event, Step) {
    return $resource(appConfig.djangoUrl + 'information-packages/:id/:action/', {}, {
        get: {
            method: "GET",
            params: { id: "@id" }
        },
        query: {
            method: 'GET',
            isArray: true,
            interceptor: {
                response: function (response) {
                    response.resource.$httpHeaders = response.headers;
                    return response.resource;
                }
            },
        },
        delete: {
            method: 'DELETE',
            params: {id: "@id" },
            hasBody: true,
            headers: { "Content-type": 'application/json;charset=utf-8' }
        },
        events: {
            method: 'GET',
            params: {action: "events", id: "@id"},
            isArray: true,
            interceptor: {
                response: function (response) {
                    response.resource.forEach(function(res, idx, array) {
                        array[idx] = new Event(res);
                    });
                    response.resource.$httpHeaders = response.headers;
                    return response.resource;
                }
            },
        },
        files: {
            method: "GET",
            params: { action: "files", id: "@id" },
            isArray: true,
            interceptor: {
                response: function (response) {
                    response.resource.$httpHeaders = response.headers;
                    return response.resource;
                }
            },
        },
        workflow: {
            method: "GET",
            params: { action: "workflow", id: "@id" },
            isArray: true
        },
        unlockProfile: {
            method: "POST",
            params: { action: "unlock-profile", id: "@id" }
        },
        checkProfile: {
            method: "PUT",
            params: { method: "check-profile", id: "@id"}
        },
        changeProfile: {
            method: "PUT",
            params: { action: "change-profile", id: "@id" }
        },
        changeSa: {
            method: "PATCH",
            params: { id: "@id" }
        },
        addFile: {
            method: "POST",
            params: { action: "files" , id: "@id" }
        },
        removeFile: {
            method: "DELETE",
            hasBody: true,
            params: { action: "files", id: "@id" },
            headers: { "Content-type": 'application/json;charset=utf-8' },
        },
        transfer: {
            method: 'POST',
            params: { action: "transfer", id: "@id" }
        },
        setUploaded: {
            method: "POST",
            params: { action: "set-uploaded", id: "@id" }
        },
        mergeChunks: {
            method: "POST",
            params: { action: "merge-uploaded-chunks", id: "@id" }
        },
        validate: {
            method: "POST",
            params: { actions: "validate", id: "@id" }
        }
    });
});
