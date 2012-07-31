define([
  'underscore',
  'backbone'
], function( _, Backbone ){

  return Backbone.View.extend({

    initialize: function( params, index  ){
      this.index  = index;
      this.id     = this.$el.attr('id');
      this.parent = params.parent;

      this.route = this.$el.data('route') || this.id;

      this.bind( 'show', this.onShow, this );
      this.bind( 'hide', this.onHide, this );
    },

    onShow: function(){
      this.$el.addClass('ui-active');
      this.navigate();
      this.$el.prev().removeClass('ui-hidden');
      this.$el.prev().prev().addClass('ui-hidden');
      this.$el.next().removeClass('ui-hidden');
      this.$el.next().next().addClass('ui-hidden');
    },

    onHide: function(){
      this.$el.removeClass('ui-active');
    },

    show: function( time, offset ){
      offset = offset || 0;

      var
        dfd = new $.Deferred(),
        current = $('.ui-active').index(),
        speed   = time || ( current === this.index ? 600 : 600 * this.index );

      $('html,body')
        .stop()
        .animate({ scrollTop: this.$el.data('height') + offset }, speed, 'easeInOutExpo', function(){
          dfd.resolve();
        });

      return dfd.promise();
    },

    navigate: function(){

      if( $('html,body').is(':animated') === false ){
        Boulderjs.router.navigate( this.route, false );
      }

      return this;
    }
  });

});

