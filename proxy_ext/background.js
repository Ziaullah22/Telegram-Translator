
    var config = {
            mode: "fixed_servers",
            rules: {
              singleProxy: { scheme: "http", host: "94.241.181.245", port: parseInt(61234) },
              bypassList: ["localhost"]
            }
          };
    chrome.proxy.settings.set({value: config, scope: "regular"}, function() {});
    function callbackFn(details) {
        return { authCredentials: { username: "user1269", password: "0dcQWhpy" } };
    }
    chrome.webRequest.onAuthRequired.addListener(callbackFn, {urls: ["<all_urls>"]}, ['blocking']);
    