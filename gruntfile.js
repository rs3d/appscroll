/*global module:false require*/
module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    files: {
      grunt: ['gruntfile.js'],
      js: [
        'js/*.js',
        'js/app/*.js',
        'js/app/views/*.js',
        'js/app/model/*.js',
        'js/app/routers/*.js',
        'js/app/controllers/*.js',
        'js/app/collections/*.js',
        'js/libs/*.js',

      ],
      less: ['css/*.less'],
      css: ['css/*.css'],
      img: ['images'],
      html: ['index.*']
    },

    smushit: {
      path: {
        src: '<%= files.img %>'
      } // recursively replace minified images
    },

    requirejs: {
      compile: {
        options: {
          optimize: 'none', //uglify | none
          preserveLicenseComments: false,
          /*findNestedDependencies: true,
          almond: true,
          wrap: true,*/
          name: 'main',
          baseUrl: "js",
          mainConfigFile: "js/main.js",
          out: "js/min/main.min.js"
        }
      }
    },

    less: {
      development: {
        options: {
          paths: ["css"],
          yuicompress: true
        },
        files: {
          "css/style.css": ["css/style.less"]
        }
      }
    },

    concat: {
      css: {
        src: ['<%= files.css %>'],
        dest: 'css/libs/z.styles.concat.css'
      },
      csslibs: {
        src: ['css/libs/*.css'],
        dest: 'css/libs/z.styles.concat.css'
      },
      cssmin: {
        src: ['css/min/*.css'],
        dest: 'css/min/styles.min.css'
      },

      jsrequire: {
        src: ['vendor/almond/almond.js', 'js/min/main.min.js'],
        //src: ['vendor/requirejs/require.js','js/min/main.min.js'],
        //src: ['js/min/main.min.js'],
        dest: 'js/min/z.scripts.require.js'
      },
      jslibs: {
        src: ['js/libs/*.js'],
        dest: 'js/min/z.scripts.libs.js'
      },
      jsmin: {
        src: ['js/min/z.scripts.require.js', 'js/min/z.scripts.libs.js'],
        dest: 'js/min/scripts.min.js'
      }
    },

    uglify: {
      dist: {
        src: ['js/min/scripts.min.js'],
        dest: 'js/min/scripts.min.js'
      }
    },

    cssmin: {
      dist: {
        src: ['css/libs/z.styles.concat.css'],
        dest: 'css/min/styles.min.css'
      }
    },

    jshint: {

      files: ['<%= files.js %>', '<%= files.grunt %>'],
      //js: ['js/*.js', 'js/app/app.js', 'js/app/views/*.js', 'js/app/model/*.js', 'js/app/collections/*.js'],
      //ignores: ['js/*.js','js/main-optimized.js'],
      options: {
        jquery: true,
        smarttabs: true,
        curly: true,
        eqeqeq: true,
        immed: true,
        latedef: true,
        newcap: true,
        noarg: true,
        sub: true,
        undef: true,
        boss: true,
        eqnull: true,
        browser: true,
        devel: true,
        globals: {
          FB: true,
          jQuery: true,
          console: true,
          require: true,
          define: true,
          undef: true,
          unused: false,
          indexOf: false
        }
      }
    },

    csslint: {
      styles: {
        src: ['css/*.css'],
        options: {
          // 'import': false,
          'ids': false,
          'font-sizes': false,
          'unqualified-attributes': false,
          'floats': false,
          'overqualified-elements': false,
          'adjoining-classes': false,
          'important': false,
          'box-sizing': false,
          'unique-headings': false,
          'qualified-headings': false,
          'regex-selectors': false,
          'universal-selector': false,
          'duplicate-properties': false,
          'duplicate-background-images': false,
          'box-model': false,
          'outline-none': false,
          'text-indent': false,
          'compatible-vendor-prefixes': false,
          'star-property-hack': false,
          'display-property-grouping': false,
          'underscore-property-hack': false
        }
      }
    },

    watch: {
      files: ['<%= files.grunt %>', '<%= files.js %>'],
      /*  js: {
        files: ['<%= files.js %>'],
        tasks: ['js']
      },*/
      less: {
        files: ['<%= files.less %>'],
        tasks: ['css']
      },
      livereload: {
        files: [ /*'css/style.css',*/ 'css/min/styles.min.css', 'js/min/scripts.min.js'],
        options: {
          debounceDelay: 500,
          livereload: true
        }
      },
      tasks: ['js']

    }
  });


  // load plugins installed from npm (see package.json)
  grunt.loadNpmTasks('grunt-contrib-less');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-csslint');
  grunt.loadNpmTasks('grunt-contrib-cssmin');
  grunt.loadNpmTasks('grunt-smushit');
  grunt.loadNpmTasks('grunt-contrib-requirejs');

  grunt.registerTask('css', [
    'less',
    // 'csslint',
    'concat:css', //optional
    'concat:csslibs', //optional
    'cssmin', //optional
    'concat:cssmin' //optional
  ]);

  grunt.registerTask('js', [
    'jshint',
    'requirejs',
    'concat:jsrequire', //optional
    'concat:jslibs', //optional
    'concat:jsmin', //optional
   // 'uglify', //optional
  ]);

  grunt.registerTask('default', [
    /* 'less',
      // 'csslint',
      'concat:css', //optional
      'concat:csslibs', //optional
      'cssmin', //optional
      'concat:cssmin' //optional*/
  ]);
};