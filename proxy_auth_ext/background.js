
    var config = {
        mode: "fixed_servers",
        rules: {
            singleProxy: { scheme: "http", host: "94.241.181.245", port: parseInt(61234) },
            bypassList: []
        }
    };
    chrome.proxy.settings.set({value: config, scope: "regular"}, function() {});
    chrome.webRequest.onAuthRequired.addListener(
        function(details) {
            return { authCredentials: { username: "user1269", password: "0dcQWhpy" } };
        },
        {urls: ["<all_urls>"]},
        ["blocking"]
    );
    