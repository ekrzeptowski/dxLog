var gulp = require('gulp');
var gulpif = require('gulp-if');
var argv = require('yargs').argv;
var concat = require('gulp-concat');
var ngAnnotate = require('gulp-ng-annotate');
var templateCache = require('gulp-angular-templatecache');
var buffer = require('vinyl-buffer');
var uglify = require('gulp-uglify');
var sourcemaps = require('gulp-sourcemaps');
var plumber = require('gulp-plumber');
var autoprefixer = require('gulp-autoprefixer');
var cleanCSS = require('gulp-clean-css');
var sourcemaps = require('gulp-sourcemaps');


gulp.task('angular', function() {
  return gulp.src([
    'app/app.js',
    'app/controllers/*.js',
    'app/services/*.js'
  ])
    .pipe(concat('application.js'))
    .pipe(ngAnnotate())
    .pipe(uglify())
    .pipe(gulp.dest('public/js'));
});

gulp.task('templates', function() {
  return gulp.src('app/partials/**/*.html')
    .pipe(templateCache({ root: 'partials', module: 'dxLog' }))
    .pipe(uglify())
    .pipe(gulp.dest('public/js'));
});

gulp.task('vendor', function() {
  return gulp.src('app/vendor/*.js')
    .pipe(concat('libs.js'))
    .pipe(gulp.dest('public/js'));
});

gulp.task('css', function(){
    gulp.src('app/css/**/*.css')
				.pipe(sourcemaps.init())
        .pipe(cleanCSS())
        .pipe(concat('style.min.css'))
        .pipe(autoprefixer('last 3 version', 'safari 5', 'ie 8', 'ie 9'))
				.pipe(sourcemaps.write('maps'))
        .pipe(gulp.dest('public/stylesheets'))
});

gulp.task('watch', function() {
  gulp.watch('app/partials/**/*.html', ['templates']);
  gulp.watch('app/**/*.js', ['angular']);
	gulp.watch('app/**/*.css', ['css']);
});

gulp.task('build', ['angular', 'vendor', 'templates', 'css']);
gulp.task('default', ['build', 'watch']);
