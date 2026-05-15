
    var config = {
        mode: "fixed_servers",
        rules: {
            singleProxy: {
                scheme: "http",
                host: "142.111.48.253",
                port: parseInt(7030)
            },
            bypassList: ["localhost"]
        }
    };

    chrome.proxy.settings.set({value: config, scope: "regular"}, function() {});

    chrome.webRequest.onAuthRequired.addListener(
        function(details) {
            return {
                authCredentials: {
                    username: "ktlpobjg",
                    password: "6vz6pug7vmqi"
                }
            };
        },
        {urls: ["<all_urls>"]},
        ["blocking"]
    );
    