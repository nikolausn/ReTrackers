// Only create main object once
if (!Zotero.RetracterZotero) {
	loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
					.getService(Components.interfaces.mozIJSSubScriptLoader);
    //loader.loadSubScript("chrome://retracterzotero/content/list_retracted.js");
	loader.loadSubScript("chrome://retracterzotero/content/retracter.js");
}
