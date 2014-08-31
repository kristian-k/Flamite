/**
 * Tinder
 */

Botinder.Tinder = (function(Botinder) {
  var token = null;
  var stop = false;

  function request(path, method, data) {
    return $.ajax({
      url: 'https://api.gotinder.com/' + path,
      type: method,
      data: data,
      beforeSend: function(request) {
        if (path !== 'auth') {
          request.setRequestHeader('X-Auth-Token', localStorage.getItem('tinder_token'));
        }
      }
    }).fail(function(res) {
      if (res.status == 401 && !stop) {
        stop = true;
        Botinder.Facebook.openAuthTab();
      }
    });
  }

  function auth(facebook_token) {
    return this.request('auth', 'POST', {
      facebook_token: facebook_token
    }).done(function() {
      stop = false;
    });
  }

  function setToken(_token) {
    token = _token;
  }

  function updateTinderData(callback) {
    var last_update = localStorage.getItem('last_update');
    var last_activity_date = localStorage.getItem('last_activity_date');

    // check if update is allow
    if (Botinder.sgl.update_tinder_data_ongo || last_update > (new Date().getTime() - 5000)) {
      callback && callback(false);
      return false;
    }

    // set settings
    Botinder.sgl.update_tinder_data_ongo = true;
    localStorage.setItem('last_update', new Date().getTime());

    // make Tinder update request
    var prm = Botinder.Tinder.request('updates', 'POST', {
      last_activity_date: last_activity_date ? last_activity_date : ''
    })

    prm.done(function(obj) {

      // save all new matches
      for (var i in obj.matches) {
        var match = obj.matches[i];

        (function(match, i) {
          var os = Botinder.db.transaction(['matches'], 'readwrite').objectStore('matches');
          var req = os.get(match['_id']);

          req.onsuccess = function(e) {
            var data = e.target.result;

            if (data) {
              data.messages = match.messages;
              data.last_activity_date = match.last_activity_date;

              // last message
              var last_message = match.messages[match.messages.length - 1];
              if (last_message && last_message.from != Botinder.user._id) {
                data.new_data = true;
              } else {
                data.new_data = false;
              }
              
              os.put(data);
            } else {
              os.add(match);
            }
          };
        })(match, i);
      }

      // set settings
      localStorage.setItem('last_activity_date', obj.matches.length === 0 ? last_activity_date : obj.last_activity_date);
      Botinder.sgl.update_tinder_data_ongo = false;

      console.log('up?', (obj.matches.length ? true : false));
      callback && callback('done', (obj.matches.length ? true : false));
    })

    prm.fail(function() {
      Botinder.sgl.update_tinder_data_ongo = false;
      callback && callback('fail');
    });

    return prm;
  }

  function chromeEvent() {
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
      
      // Tinder request
      if (request.type === 'request') {
        var prm = Botinder.Tinder.request(
          request.path, 
          request.method ? request.method : 'GET', 
          request.data ? request.data : {}
        );

        prm.done(function(obj) {
          sendResponse(obj);
        });

        prm.fail(function(obj) {
          sendResponse(false);
        });
      }

      // matches
      else if (request.type === 'matches') {
        Botinder.IndexedDB.getMatches(request.limit, request.offset, function(matches) {
          sendResponse(matches);
        });
      }

      // match
      else if (request.type === 'match') {
        var os = Botinder.db.transaction(['matches'], 'readwrite').objectStore('matches');
        var req = os.get(request.id);

        req.onsuccess = function(e) {
          var data = e.target.result;
          data.new_data = false;
          os.put(data);
          sendResponse(data);
        };
      }

      // post message
      else if (request.type === 'message_post') {
        Botinder.Tinder.request('user/matches/' + request.id, 'POST', {
          message: request.message
        });

        return false;
      }

      // update data
      else if (request.type === 'update') {
        Botinder.Tinder.updateTinderData(function(status, update) {
          sendResponse({
            status: status,
            update: update
          });
        });
      }

      return true;
    });
  }

  return {
    init: function() {
      chromeEvent();
    },
    request: request,
    auth: auth,
    setToken: setToken,
    updateTinderData: updateTinderData
  };
})(Botinder);