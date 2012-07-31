define([
  'underscore',
  'backbone',
  'page',
  'transform',
  'easing'
], function( _, Backbone, Page ){

  return Backbone.View.extend({

    el: $('#main'),

    initialize: function( params ){
      this.initializePages();
      this.scroll();
      this.keyboard();

      var _this = this;

      $(window).on( 'resize', function(){
        _this.initializePages();
      });

      return this;
    },

    active_index: {},

    pages: {},

    getPage: function( id ){
      return _( this.pages ).find(function( page ){
        if( page.id == id || page.route == id ){
          return true;
        }
      });
    },

    initializePages: function(){
      var
        _height = 0,
        _this   = this;

      this.$('article').each(function(i, elem){
        var _elem = $(elem);

        _this.pages[ elem.id ] = new Page({
          el: _elem,
          parent: _this
        }, i);

        _this.pages[ elem.id ].render();

        _elem
          .css('z-index', 200 - i )
          .data('height', _height);

        _height += _elem.height();

      });

      this.$el.css('height', _height);

    },

    scroll: function(){
      var
        _this   = this,
        _window = $(window);

      var prevPosition = _window.scrollTop();

      _window.on('scroll', _.throttle(function(e){
        var
          _active       = _this.$('.ui-active'),
          scroll_pos    = _window.scrollTop(),
          active_height = _active.data('height'),
          scroll_offset = scroll_pos - active_height;

        _this.active_index = _active.index();

        // Scroll the active page and make sure the page below is visible
        _active
          .css({ 'translateY': '-'+ scroll_offset });

        // When scrolling to the top of the page, activate sections in reverse
        // order
        if( scroll_offset < 0  ) {
          return _this.setActive( 'prev' );
        }

        // Activate the next section when the window passes the active section
        if( _active.height() - scroll_offset  <= 0 ){
          return _this.setActive( 'next' );
        }

        prevPosition = scroll_pos;
      }, 30));
    },

    setActive: function( direction ){
      direction = direction || 'next';

      var
        current    = this.$('.ui-active'),
        new_active = current[ direction ]();

      if( direction === 'prev' ){
        current.css('translateY', 0);
      }

      if( new_active.length ){
        this.pages[ current.attr('id') ].trigger('hide');
        this.pages[ new_active.attr('id') ].trigger('show');
      }

    },

    navigate: function( direction ){
      direction = direction || 'next';

      var
        current = this.$('.ui-active'),
        next    = current[ direction ]();

      var $window = $(window);

      var frag = current.find('.fragment').not('h1, .js-show').first();

      if( direction === 'next' && frag.length ){
        frag.addClass('js-show');
        return;
      }

      if( next.length ){
        next = this.pages[ next.attr('id') ];

        next.show( 600 ).done(function(){
          if( direction === 'prev' )
            $('html,body').stop();

          next.navigate();
        });
      }

    },

    keyboard: function(){
      var
        _this   = this,
        key_map = {};

      // down + right
      key_map[40] = key_map[39] = function(){
        _this.navigate('next');
      };

      // up + left
      key_map[38] = key_map[37] = function(){
        _this.navigate('prev');
      };

      function onKeydown( event ){
        if( $('html,body').is(':animated') === true )
          return;

        var key = event.which;

        if( key in key_map ){
          key_map[ key ]();
          return false;
        }
      }

      $(window).on('keydown', _.throttle( onKeydown, 100 ) );
    }

  });

});
