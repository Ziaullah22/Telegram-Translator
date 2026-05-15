
    var config = {
        mode: "fixed_servers",
        rules: {
            singleProxy: {
                scheme: "http",
                host: "23.95.150.145",
                port: parseInt(6114)
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
    