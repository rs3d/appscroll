define([
		'modernizr',
		'jquery',
		'underscore',
		'backbone',
		'ftscroller',
		'app/vent',
], function(Modernizr, $, _, Backbone, FTScroller, vent) {
	'use strict';

	var AppView = Backbone.View.extend({
		title: '',
		sectionIds: [],
		currentSection: 'Home',
		el: 'body',

		events: {
			'click a[href^=#]': 'onAnchorClick',
			'click button.change.size': 'changeSize',
			'submit form': 'submitForm'
		},

		initialize: function() {
			// INIT
			this.$document = $(document);
			this.title = this.$document.attr('title');
			this.$main = this.$el.find('#main');
			this.$navLinks = this.$el.find('nav a');
			this.$sections = this.$el.find('section');
			this.$form = this.$el.find('form:first');
			this.$loader = this.$el.find('#loading');
			this.sectionIds = this.getIds(this.$sections);

			this.scroller = new FTScroller(document.getElementById('main'), {
				scrollingX: false,
				scrollbars: false,
				snapping: true,
				//snapSizeY: this.getDimensions(this.$sections)
				updateOnChanges: true,
				updateOnWindowResize: true,
			});
			console.log(this.scroller);

			// EVENTS
			this.listenTo(vent, 'Router', this.router, this);
			this.scroller.addEventListener('segmentwillchange', this.onSegmentChange, this);

		},

		changeSize: function(e) {
			var $el = $(e.currentTarget);
			$el.parents('section:first').height(600);
			this.scroller.updateDimensions();
			//$el.parents('section:first').before('<section style="height: 600px">test</section>');
		},

		onSegmentChange: function (segment) {
			console.warn('onSegmentChange', segment);
		},

		getDimensions: function($els) {
			var dimensions = [];
			$els.each(function (i, el){
				var $el = $(el);
				dimensions.push({ x: $el.width(), y: $el.height()});
			});

			/*dimensions = [{
					x: 400,
					y: 300
				}, {
					x: 400,
					y: 400
				}, {
					x: 400,
					y: 1000
				}, {
					x: 400,
					y: 200
				}, {
					x: 400,
					y: 350
				}, {
					x: 400,
					y: 400
				}
			];*/
			return dimensions;

		},

		onAnchorClick: function(e) {
			e.preventDefault();
			var $el = $(e.currentTarget),
				href = $el.attr('href');
			if (href === '#' + this.currentSection) {
				//e.preventDefault();
				return false;
			}
			vent.trigger('App:onAnchorClick', href, {
				trigger: true
			});
		},

		getIds: function($els) {
			var ids = [];
			_.each($els, function(el, i) {
				ids.push(el.id);
			});
			return ids;
		},

		setLoading: function() {
			var $deferred = $.Deferred();
			this.$loader.fadeIn(0, function() {
				this.$el.addClass('loading');
				$deferred.resolve();
			}.bind(this));
			return $deferred;
		},

		setLoaded: function() {
			var $deferred = $.Deferred();
			this.$loader.fadeOut(0, function() {
				this.$el.removeClass('loading');
				$deferred.resolve();
			}.bind(this));
			return $deferred;
		},

		router: function(param) {
			/*if (_.indexOf(this.sectionIds, param) > -1 && param !== this.currentSection) {
				return this.showSection(param);
			}
			return this.showSection(this.currentSection);*/
		},

		render: function() {
			return this;
		}
	});

	return AppView;
});