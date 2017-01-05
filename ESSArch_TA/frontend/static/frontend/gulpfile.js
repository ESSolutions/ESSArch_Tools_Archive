var gulp = require('gulp')
var sass = require('gulp-sass');
var sourcemaps = require('gulp-sourcemaps');
var concat = require('gulp-concat');
var gulpif = require('gulp-if');
var ngAnnotate = require('gulp-ng-annotate');
var plumber = require('gulp-plumber');
var rename = require('gulp-rename');
var uglify = require('gulp-uglify');
var gutil = require('gulp-util');
var argv = require('yargs').argv;
var isProduction = (argv.production === undefined) ? false : true;

var vendorFiles = [
        'scripts/bower_components/api-check/dist/api-check.js',
        'scripts/bower_components/jquery/dist/jquery.js',
        'scripts/bower_components/angular/angular.js',
        'scripts/bower_components/angular-route/angular-route.js',
        'scripts/bower_components/angular-bootstrap/ui-bootstrap-tpls.js',
        'scripts/bower_components/angular-tree-control/angular-tree-control.js',
        'scripts/bower_components/angular-formly/dist/formly.js',
        'scripts/bower_components/angular-formly-templates-bootstrap/dist/angular-formly-templates-bootstrap.js',
        'scripts/bower_components/angular-smart-table/dist/smart-table.js',
        'scripts/bower_components/angular-bootstrap-grid-tree/src/tree-grid-directive.js',
        'scripts/bower_components/angular-ui-router/release/angular-ui-router.js',
        'scripts/bower_components/angular-cookies/angular-cookies.js ',
        'scripts/bower_components/angular-permission/dist/angular-permission.js',
        'scripts/bower_components/angular-translate/angular-translate.js',
        'scripts/bower_components/angular-translate-storage-cookie/angular-translate-storage-cookie.js',
        'scripts/bower_components/angular-translate-loader-static-files/angular-translate-loader-static-files.js',
        'scripts/bower_components/angular-sanitize/angular-sanitize.js',
        'scripts/bower_components/angular-ui-select/dist/select.js',
        'scripts/bower_components/bootstrap/dist/js/bootstrap.js',
        'node_modules/moment/min/moment-with-locales.js',
        'scripts/bower_components/angular-moment-picker/dist/angular-moment-picker.js'
    ],
    jsFiles = [
        'scripts/myApp.js', 'scripts/controllers/*.js', 'scripts/services/*.js',
        'scripts/directives/*.js', 'scripts/configs/*.js'
    ],
    jsDest = 'scripts',
    cssFiles = [
        'styles/modules/index.scss',
        'styles/modules/login.scss',
        'styles/modules/my_page.scss',
        'styles/modules/receive_sip.scss',
        'styles/styles.scss'
    ],
    cssDest = 'styles';

var buildScripts = function() {
    return gulp.src(jsFiles)
        .pipe(plumber(function(error) {
          // output an error message

          gutil.log(gutil.colors.red('error (' + error.plugin + '): ' + error.message));
          // emit the end event, to properly end the task
          this.emit('end');
        }))
        .pipe(sourcemaps.init())
        .pipe(ngAnnotate())
        .pipe(concat('scripts.min.js'))
        .pipe(gulpif(isProduction, uglify()))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest(jsDest));
};

var buildVendors = function() {
    return gulp.src(vendorFiles)
        .pipe(plumber(function(error) {
          // output an error message

          gutil.log(gutil.colors.red('error (' + error.plugin + '): ' + error.message));
          // emit the end event, to properly end the task
          this.emit('end');
        }))
        .pipe(sourcemaps.init())
        .pipe(ngAnnotate())
        .pipe(concat('vendors.min.js'))
        .pipe(gulpif(isProduction, uglify()))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest(jsDest));
};
var compileSass = function() {
 return gulp.src('styles/styles.scss')
    .pipe(sass().on('error', sass.logError))
    .pipe(gulp.dest('styles'));
};
var copyIcons = function() {
    return gulp.src('scripts/bower_components/font-awesome/fonts/**.*') 
        .pipe(gulp.dest('fonts')); 
};
var copyImages = function() {
    return gulp.src('scripts/bower_components/angular-tree-control/images/**.*') 
        .pipe(gulp.dest('images')); 
};

gulp.task('default', function() {
    buildScripts(),
    buildVendors(),
    compileSass(),
    copyIcons(),
    copyImages()
});


gulp.task('icons', copyIcons);
gulp.task('images', copyImages);
gulp.task('scripts', buildScripts);
gulp.task('vendors', buildVendors);
gulp.task('sass', compileSass);

gulp.task('watch', function(){
    gulp.watch(jsFiles, ['scripts']);
    gulp.watch(vendorFiles, ['vendors']);
    gulp.watch(cssFiles, ['sass']);
})
