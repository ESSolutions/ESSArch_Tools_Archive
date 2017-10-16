angular.module('myApp').factory('WorkareaFiles', function ($resource, appConfig) {
    return $resource(appConfig.djangoUrl + 'workarea-files/:action/', {}, {
        addToDip: {
            method: "POST",
            params: { action: "add-to-dip" }
        },
        removeFile: {
            method: "DELETE",
            hasBody: true,
            headers: { "Content-type": 'application/json;charset=utf-8' },
        },
        addDirectory: {
            method: "POST",
            params: { action: "add-directory" }
        },
        mergeChunks: {
            method: "POST",
            params: { action: "merge-uploaded-chunks" }
        }
    });
});
