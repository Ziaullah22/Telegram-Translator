
    var config = {
        mode: "fixed_servers",
        rules: {
            singleProxy: {
                scheme: "http",
                host: "86.104.163.65",
                port: parseInt(12323)
            },
            bypassList: ["localhost"]
        }
    };

    chrome.proxy.settings.set({value: config, scope: "regular"}, function() {});

    chrome.webRequest.onAuthRequired.addListener(
        function(details) {
            return {
                authCredentials: {
                    username: "14a89fda25992",
                    password: "8df656d77e"
                }
            };
        },
        {urls: ["<all_urls>"]},
        ["blocking"]
    );
    