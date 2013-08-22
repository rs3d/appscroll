/*global define*/
define([
	'jquery',
	'backbone',
	'app/vent'
], function($, Backbone, vent) {
	'use strict';

	var Workspace = Backbone.Router.extend({
		initialize: function(options) {
						window.scrollTo(0, 0);
			this.listenTo(vent, 'App:onAnchorClick', this.navigate, this);
		},
		routes: {
			'*actions': 'defaultRoute'
		},

		defaultRoute: function(param) {
			window.scrollTo(0, 0);
			param = param ? param.trim() : '';
			vent.trigger('Router', param);
		}
	});

	return Workspace;
});