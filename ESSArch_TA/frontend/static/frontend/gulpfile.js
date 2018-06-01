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

var gulp = require('gulp')
var glob = require("glob")
var debug = require('gulp-debug');
var babelify = require('babelify');
var browserify = require('browserify');
var vinylSourceStream = require('vinyl-source-stream');
var vinylBuffer = require('vinyl-buffer');
var sass = require('gulp-sass');
var ngConstant = require('gulp-ng-constant');
var sourcemaps = require('gulp-sourcemaps');
var concat = require('gulp-concat');
var gulpif = require('gulp-if');
var ngAnnotate = require('gulp-ng-annotate');
var templateCache = require('gulp-angular-templatecache');
var plumber = require('gulp-plumber');
var rename = require('gulp-rename');
var uglify = require('gulp-uglify');
var stripDebug = require('gulp-strip-debug');
var cleanCSS = require('gulp-clean-css');
var gutil = require('gulp-util');
var license = require('gulp-header-license');
var fs = require('fs');
var path = require('path');
var argv = require('yargs').argv;
var isProduction = (argv.production === undefined) ? false : true;

var plugins = require('gulp-load-plugins')();

var core = process.env.EC_FRONTEND;
var coreHtmlFiles = [path.join(core, 'views/**/*.html')];
var coreJsFiles = [path.join(core, 'scripts/**/*.js')];
var coreCssFiles = path.join(core, 'styles');

var jsPolyfillFiles = [
    'node_modules/ie-array-find-polyfill/index.js',
    'node_modules/string.prototype.startswith/startswith.js',
    'node_modules/string.prototype.endswith/endswith.js',
    'node_modules/string.prototype.contains/contains.js',
    'node_modules/console-polyfill/index.js',
    'scripts/polyfills/*.js',
]
var jsFiles = [
        'scripts/myApp.js', 'scripts/controllers/*.js', 'scripts/components/*.js',
        'scripts/services/*.js', 'scripts/directives/*.js', 'scripts/configs/*.js'
    ],
    jsDest = 'scripts',
    cssFiles = [
        coreCssFiles + "/**/*.scss",
        'styles/modules/index.scss',
        'styles/modules/login.scss',
        'styles/modules/my_page.scss',
        'styles/modules/receive_sip.scss',
        'styles/modules/workspace.scss',
        'styles/modules/profile_editor.scss',
        'styles/modules/colors.scss',
        'styles/modules/mixins.scss',
        'styles/modules/tree_control.scss',
        'styles/modules/notifications.scss',
        'styles/modules/positions.scss',
        'styles/modules/utils.scss',
        'styles/styles.scss'
    ],
    cssDest = 'styles';

var licenseString = fs.readFileSync('license.txt');

var buildPolyfills= function() {
    return gulp.src(jsPolyfillFiles)
        .pipe(plumber(function(error) {
          // output an error message

          gutil.log(gutil.colors.red('error (' + error.plugin + '): ' + error.message));
          // emit the end event, to properly end the task
          this.emit('end');
        }))
        .pipe(sourcemaps.init())
        .pipe(ngAnnotate())
        .pipe(concat('polyfills.min.js'))
        .pipe(gulpif(isProduction, uglify()))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest(jsDest));
};

var buildCoreTemplates = function() {
    return gulp.src(coreHtmlFiles)
        .pipe(templateCache({standalone: true}))
        .pipe(gulp.dest('scripts/core'));
}

var buildCoreScripts = function() {
    return gulp.src(coreJsFiles)
        .pipe(concat('scripts.js'))
        .pipe(gulp.dest('scripts/core'));
}

var buildScripts = function() {
    var all_files = [];
    jsFiles.forEach(function(path){
        try {
            console.log(path)
            var is_file = fs.lstatSync(path).isFile();
            all_files.push(path);
        } catch (e) {
            all_files = all_files.concat(glob.sync(path))        }
    });
    var sources = browserify({
        entries: [all_files],
        paths: ['./node_modules', path.join(core, 'scripts'), './scripts/core'],
        debug: true, // Build source maps
        insertGlobalVars: {
            $: function(file, dir) {
                return 'require("jquery")';
            },
            jQuery: function(file, dir) {
                return 'require("jquery")';
            },
            moment: function(file, dir) {
                return 'require("moment")';
            }
        }
    })
    .transform("babelify", {global: true, ignore: /\/node_modules\/(?!angular-link-header-parser|angular-websocket|bufferutil|utf-8-validate\/)/, presets: [require("babel-preset-es2015")], plugins: [require("babel-plugin-angularjs-annotate")]});

    return sources.bundle()
        .pipe(vinylSourceStream('scripts.min.js'))
        .pipe(vinylBuffer())
        .pipe(plugins.sourcemaps.init({
            loadMaps: true // Load the sourcemaps browserify already generated
        }))
        .pipe(plugins.uglify())
        .on('error', function (err) { gutil.log(gutil.colors.red('[Error]'), err.toString()); })
        .pipe(plugins.sourcemaps.write('./', {
            includeContent: true
        }))
        .pipe(gulp.dest('scripts'));
};

var compileSass = function() {
 return gulp.src('styles/styles.scss')
    .pipe(sourcemaps.init({loadMaps: true}))
    .pipe(sass({includePaths: coreCssFiles}).on('error', sass.logError))
    .pipe(cleanCSS({
      cleanupCharsets: true, // controls `@charset` moving to the front of a stylesheet; defaults to `true`
      normalizeUrls: true, // controls URL normalization; defaults to `true`
      optimizeBackground: true, // controls `background` property optimizatons; defaults to `true`
      optimizeBorderRadius: true, // controls `border-radius` property optimizatons; defaults to `true`
      optimizeFilter: true, // controls `filter` property optimizatons; defaults to `true`
      optimizeFont: true, // ontrols `font` property optimizatons; defaults to `true`
      optimizeFontWeight: true, // controls `font-weight` property optimizatons; defaults to `true`
      optimizeOutline: true, // controls `outline` property optimizatons; defaults to `true`
      removeNegativePaddings: true, // controls removing negative paddings; defaults to `true`
      removeQuotes: true, // controls removing quotes when unnecessary; defaults to `true`
      removeWhitespace: true, // controls removing unused whitespace; defaults to `true`
      replaceMultipleZeros: true, // contols removing redundant zeros; defaults to `true`
      replaceTimeUnits: true, // controls replacing time units with shorter values; defaults to `true`
      replaceZeroUnits: true, // controls replacing zero values with units; defaults to `true`
      roundingPrecision: false, // rounds pixel values to `N` decimal places; `false` disables rounding; defaults to `false`
      selectorsSortingMethod: 'standard', // denotes selector sorting method; can be `natural` or `standard`; defaults to `standard`
      keepSpecialComments: 0, // denotes a number of /*! ... */ comments preserved; defaults to `all`
      tidyAtRules: true, // controls at-rules (e.g. `@charset`, `@import`) optimizing; defaults to `true`
      tidyBlockScopes: true, // controls block scopes (e.g. `@media`) optimizing; defaults to `true`
      tidySelectors: true, // controls selectors optimizing; defaults to `true`,
      transform: function () {} // defines a callback for fine-grained property optimization; defaults to no-op
    }))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest('styles'));
};
var copyIcons = function() {
    return gulp.src('node_modules/font-awesome/fonts/**.*') 
        .pipe(gulp.dest('fonts')); 
};
var copyImages = function() {
    return gulp.src('node_modules/angular-tree-control/images/**.*') 
        .pipe(gulp.dest('images')); 
};
var configConstants = function() {
    var myConfig = require('./scripts/configs/config.json');
    if(isProduction) {
        var envConfig = myConfig["production"];
    } else {
        var envConfig = myConfig["development"];
    }
    return ngConstant({
        name: 'myApp.config',
        constants: envConfig,
        stream: true
    })
    .pipe(rename('myApp.config.js'))
    .pipe(gulp.dest('./scripts/configs'));
};

var permissionConfig = function() {
    var permissionConfig = require('./scripts/configs/permissions.json');
    var envConfig = permissionConfig;
    return ngConstant({
        name: 'permission.config',
        constants: envConfig,
        stream: true
    })
    .pipe(rename('permission.config.js'))
    .pipe(gulp.dest('./scripts/configs'));
};

gulp.task('default', ['core_templates', 'core_scripts'], function() {
    configConstants();
    permissionConfig();
    compileSass();
    copyIcons();
    copyImages()
    buildPolyfills();
    return buildScripts();
});

gulp.task('scripts', function() {


});

gulp.task('icons', copyIcons);
gulp.task('images', copyImages);
gulp.task('polyfills', buildPolyfills);
gulp.task('core_templates', buildCoreTemplates);
gulp.task('core_scripts', buildCoreScripts);
gulp.task('scripts', buildScripts);
gulp.task('sass', compileSass);
gulp.task('config', configConstants);

gulp.task('watch', function(){
    gulp.watch(coreHtmlFiles, ['core_templates']);
    gulp.watch(coreJsFiles, ['core_scripts']);
    gulp.watch(jsFiles, ['scripts']);
    gulp.watch(jsPolyfillFiles, ['polyfills']);
    gulp.watch(cssFiles, ['sass']);
})
