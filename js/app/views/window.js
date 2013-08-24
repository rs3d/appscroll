define([
  'underscore',
  'backbone',
  'app/vent',
  'templates'
], function(_, Backbone, vent, templates) {
  "use strict";

  return Backbone.View.extend({
    //template : templates.footer,
    el: window,
    $document: null,
    $html: null,
    $body: null,
    $htmlbody: null,
    scrollY: 0,
    lastScrollY: 0,
    width: {
      mode: 'medium', // extra small, small, medium, large
      'window': 0,
      'document': 0
    },
    height: {
      'window': 0,
      'document': 0
    },
    ticking: false,
    direction: '',


    events: {
      'scroll': 'onScroll',
      'resize': 'onResize'
    },
    initialize: function() {
      console.log('init window', this);
      this.$document = $(document);
      this.$html = this.$document.find('html:first');
      this.$body = this.$html.find('body:first');
      this.$htmlbody = this.$html.add(this.$body);

      this.polyfillRaf();

      this.onResize();
      this.listenTo(vent, 'window:scroll', this.getScrollDirection, this);
      this.$document.on('click', 'a[href^="#"]', this.anchorLink.bind(this));

      //this.on('scroll', 'onScroll');
    },

    anchorLink: function(e) {
      //e.preventDefault();
      vent.trigger('window:click:anchor');
      var $el = $(e.currentTarget),
        href = $el.attr('href');
      // only scroll to element if href is equal 
      // to hash; we'll let hashchange event 
      // handle everything else
      if (href === window.location.hash) {
        //this.scrollToHash( href )
      }
      console.log(this, e, href);
    },



    polyfillRaf: function() {
      //http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating
      (function() {
        var lastTime = 0;
        var vendors = ['ms', 'moz', 'webkit', 'o'];
        for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
          window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
          window.cancelRequestAnimationFrame = window[vendors[x] +
            'CancelRequestAnimationFrame'];
        }

        if (!window.requestAnimationFrame) {
          window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() {
                callback(currTime + timeToCall);
              },
              timeToCall);
            lastTime = currTime + timeToCall;
            return id;
          };
        }

        if (!window.cancelAnimationFrame) {
          window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
          };
        }
      }());
    },

    getScrollDirection: function() {
      var direction = this.scrollY < this.lastScrollY ? 'up' : 'down';
      if (this.scrollY === 0) {
        direction = 'up';
      }
      if (this.scrollY + this.height.window >= this.height.document) {
        direction = 'down';
      }
      if (direction === this.direction) {
        return false;
      }
      console.log(direction);
      this.direction = direction;
      vent.trigger('window:direction:change', {
        direction: direction,
        scrollY: this.scrollY,
        height: this.height
      });
    },

    onScroll: function(e) {
      //console.log(e);
      this.ticking = false;

      this.scrollY = document.documentElement.scrollTop  || window.pageYOffset;
      this.scrollY = this.scrollY < 0 ? 0 : this.scrollY;

      this.requestTick('updateScroll');
    },

    updateScroll: function() {
      vent.trigger('window:scroll', this.scrollY);
      this.lastScrollY = this.scrollY;
      this.ticking = false;
    },

    onResize: function(e) {
      var mode;
      this.ticking = false;
      this.height.window = this.$el.height();
      this.height.document = this.$document.height();
      this.width.window = this.$el.width();
      this.width.document = this.$document.width();

      if (this.width.document < 768) {
        mode = 'extra small';
      } else if (this.width.document < 960) {
        mode = 'small';
      } else if (this.width.document < 1170) {
        mode = 'medium';
      } else {
        mode = 'large';
      }

      vent.trigger('window:resize:change', this.width);
      if (mode === this.width.mode) {
        return;
      } //nochange
      this.width.mode = mode;
      console.log(this.width);
      vent.trigger('window:mode:change', this.width);
    },


    requestTick: function(method) {
      if (!this.ticking) {
        window.requestAnimationFrame(this[method].bind(this));
        this.ticking = true;
      }
    },

    render: function() {
      console.log('rendering Navigation');
      return this;
    }
  });

});