define([
	'underscore',
	'backbone'
], function(_, Backbone) {
	'use strict';
	var vent = {};
	_.extend(vent, Backbone.Events);
	return vent;
});