import os
import shutil

def create_proxy_auth_extension(proxy_host, proxy_port, proxy_user, proxy_pass, extension_dir):
    """Creates a temporary Chrome extension to handle proxy authentication."""
    if os.path.exists(extension_dir):
        shutil.rmtree(extension_dir)
    os.makedirs(extension_dir)

    manifest_json = """
    {
        "version": "1.0.0",
        "manifest_version": 2,
        "name": "Chrome Proxy",
        "permissions": [
            "proxy",
            "tabs",
            "unlimitedStorage",
            "storage",
            "<all_urls>",
            "webRequest",
            "webRequestBlocking"
        ],
        "background": {
            "scripts": ["background.js"]
        },
        "minimum_chrome_version":"22.0.0"
    }
    """

    background_js = f"""
    var config = {{
        mode: "fixed_servers",
        rules: {{
            singleProxy: {{
                scheme: "http",
                host: "{proxy_host}",
                port: parseInt({proxy_port})
            }},
            bypassList: ["localhost"]
        }}
    }};

    chrome.proxy.settings.set({{value: config, scope: "regular"}}, function() {{}});

    chrome.webRequest.onAuthRequired.addListener(
        function(details) {{
            return {{
                authCredentials: {{
                    username: "{proxy_user}",
                    password: "{proxy_pass}"
                }}
            }};
        }},
        {{urls: ["<all_urls>"]}},
        ["blocking"]
    );
    """

    with open(os.path.join(extension_dir, "manifest.json"), "w") as f:
        f.write(manifest_json)

    with open(os.path.join(extension_dir, "background.js"), "w") as f:
        f.write(background_js)

    return extension_dir
