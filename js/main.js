require.config({
  baseUrl: 'js',
  paths: {
    'es5shim': '../vendor/es5-shim/es5-shim',
    'jquery': '../vendor/jquery/jquery',
    'underscore': '../vendor/underscore-amd/underscore',
    'backbone': '../vendor/backbone-amd/backbone',
    'ftscroller': 'require/ftscroller',
    //'jquerypp': '../vendor/jquerypp',

  },
  shim: {
    jquery: {
      exports: '$'
    },
    underscore: {
      exports: '_'
    },
    backbone: {
      deps: ['jquery', 'underscore'],
      exports: 'Backbone'
    },
    ftscroller: {
      exports: 'FTScroller'
    }
  }
});

define('modernizr', function() {
  return window.Modernizr;
});

require([
  'es5shim',
  'backbone',
  'app/app',
  'app/routers/router'
], function(es5shim,Backbone, App, Router) {
  /*jshint nonew:false*/
  new App();

  // Initialize routing and start Backbone.history()
  new Router();
  Backbone.history.start();

  // Initialize the application view
});