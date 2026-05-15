
    var config = {
        mode: "fixed_servers",
        rules: {
            singleProxy: {
                scheme: "http",
                host: "167.148.57.250",
                port: parseInt(61234)
            },
            bypassList: ["localhost"]
        }
    };

    chrome.proxy.settings.set({value: config, scope: "regular"}, function() {});

    chrome.webRequest.onAuthRequired.addListener(
        function(details) {
            return {
                authCredentials: {
                    username: "user_36ebb56fce19",
                    password: "kMehVECi"
                }
            };
        },
        {urls: ["<all_urls>"]},
        ["blocking"]
    );
    