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

			var scroller = new FTScroller(document.getElementById('main'), {
				scrollingX: false,
				scrollbars: false,
				snapping: true,
				paginatedSnap: true

				//snapSizeY: 100
			});
			console.log(scroller);

			// EVENTS
			this.listenTo(vent, 'Router', this.router, this);

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