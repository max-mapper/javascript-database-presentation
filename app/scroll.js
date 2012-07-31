define([
  'underscore',

], function( _ ){


  // Scroll event bindings
  function Scroll( app ){
    this.app = app;
    var self = this;
    var $window = this.$window = $(window);

    // cache initial position
    this.prevPosition = $window.scrollTop();

    // use an empty jQuery object to give us our isolated events
    var events = this.events = $({});

    // attach a single, unthrottled handler to the scroll event that will act
    // as an EventEmitter.
    //
    //  forward - left-to-right scrolling
    //  back    - right-to-left scrolling
    //  start   - scroll returns to original position
    //  end     - scroll reaches end of viewer
    //
    app.$el.on('scroll', function(e){

      self.scrollTop = $window.scrollTop();

      if( self.scrollTop >= self.prevPosition ){
        events.trigger('forward');

      } else {
        events.trigger('back');

        if( self.scrollTop < 1 ){
          events.trigger('start');
        }
      }

      if( self.scrollTop >= app.width - $window.width() ){
        events.trigger('end');
      }

      self.prevPosition = self.scrollTop;

    });


  }

  return Scroll;

});

