
    var config = {
        mode: "fixed_servers",
        rules: {
            singleProxy: {
                scheme: "http",
                host: "38.154.203.95",
                port: parseInt(5863)
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
    