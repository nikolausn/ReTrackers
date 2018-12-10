/**
 * Created by nikolausn on 12/5/18.
 */

if (typeof Zotero === 'undefined') {
    Zotero = {};
}

Zotero.RetracterZotero = {};

Zotero.RetracterZotero.resetState = function () {
}

Zotero.RetracterZotero.init = function () {
    // Register the callback in Zotero as an item observer
    var notifierID = Zotero.Notifier.registerObserver(this.notifierCallback, ['sync']);

    Zotero.debug('Retracters Plugin, grabbing retracted paper' + notifierID);

    // Unregister callback when the window closes (important to avoid a memory leak)
    window.addEventListener('unload', function (e) {
        Zotero.Notifier.unregisterObserver(notifierID);
    }, false);
};

/*
 checking retracted items whenever sync button executed
 using notifierCallback on item observer
 */

Zotero.RetracterZotero.notifierCallback = {
    notify: function (event, type, ids, extraData) {
        Zotero.debug("Retracter event: " + event);
        Zotero.debug("Retracter type: " + type);
        Zotero.debug("Retracter ids: " + ids);

        if (event === 'finish') {
            // fetch all zotero items
            Zotero.debug("Retracter, checking all items")
            // get all produce items promise
            items = Zotero.Items.getAll(1, false, true);
            //items = Zotero.Items.getAll();
            zotlib = Zotero.Libraries.getAll();
            Zotero.debug("Retracter libraries: " + JSON.stringify(zotlib));
            Zotero.debug("Retracter items: " + JSON.stringify(items));

            items.then(responses => responses.forEach(
                response => {
                var localResp = response;
                Zotero.debug("Retracter fetching item: " + JSON.stringify(localResp));
                Zotero.debug("Retracter title: "+localResp["title"]);
                Zotero.debug("fetch retraction data");
                const url = "http://retractiondatabase.org/RetractionSearch.aspx#?ttl=" + localResp["title"];
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);

                // If specified, responseType must be empty string or "text"
                xhr.responseType = 'text';

                xhr.onload = function () {
                    if (xhr.readyState === xhr.DONE) {
                        if (xhr.status === 200) {
                            Zotero.debug("Retracter resp: "+xhr.response);
                            Zotero.debug("Retracter text: "+xhr.responseText);
                        }
                    }
                };
                xhr.send(null);
        }));
            /*
            items.then(responses => responses.forEach(
                response => {
                    Zotero.debug("Retracter fetching item: " + JSON.stringify(response));
                    const url = "http://retractiondatabase.org/RetractionSearch.aspx#?ttl=" + response.title;
                    fetch(url, {
                        method: "GET"
                    }).then(
                        response = > response.text(); // .json(), etc.
                        // same as function(response) {return response.text();}
                    ).then(
                        html = > Zoterp.debug("Retracter html: " + html);
                    );
                }));
            */
        /*
         items.then(responses => responses.forEach(
         function(response){
         //var xhr = new XMLHttpRequest();
         //xhr.ge
         Zotero.debug("Retracter fetching item: " + JSON.stringify(response));
         const url = "http://retractiondatabase.org/RetractionSearch.aspx#?ttl="+response.title;
         fetch(url, {
         method : "GET"
         }).then(
         response => response.text(); // .json(), etc.
         // same as function(response) {return response.text();}
         ).then(
         html => Zoterp.debug("Retracter html: "+html);
         );
         }
         ));
         */

        //Zotero.debug("Retracter libraries: "+JSON.stringify(zotlib));
        //for (item of zotlib) {
        //    Zotero.debug("Retracter item: "+JSON.stringify(item))
        //}
    }

    /*
     if (event == 'add' || event == 'modify') {
     var items = Zotero.Items.get(ids);
     var item, url, date;
     var today = new Date();

     for (item of items) {
     url = item.getField('url');
     date = item.getField('date');
     console.log('url=' + url, ', date=' + date);
     if (url && !date) {
     var req = new XMLHttpRequest();
     req.open('GET', url, false);
     req.send(null);
     if (req.status == 200) {
     date = req.getResponseHeader("Last-Modified");
     if (date && date != '') {
     try {
     date = new Date(date);
     if (date.year !== 'undefined' && date.getDate() != today.getDate() && date.getMonth() != today.getMonth() && date.getYear() != today.getYear()) {
     date = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
     item.setField('date', date);
     item.save();
     }
     } catch (err) {
     console.log('Could not set date "' + date + '": ' + err);
     }
     }
     }
     }
     }
     }
     */
}
}
;

Zotero.RetracterZotero.checkRetracted = function () {
    Zotero.Items.getAll().forEach(function (item) {
        if (item.isRegularItem() && !item.isCollection()) {
            var libraryId = item.getField('libraryID');
            if (libraryId == null ||
                libraryId == '' ||
                Zotero.Libraries.isEditable(libraryId)) {
                items.push(item);
            }
        }
    });
}

// Initialize the utility
window.addEventListener('load', function (e) {
    Zotero.RetracterZotero.init();
}, false);


/*
 Zotero.RetracterZotero.init = function () {

 }

 Zotero.RetracterZotero = {
 DB: null,

 init: function () {
 // Connect to (and create, if necessary) helloworld.sqlite in the Zotero directory
 this.DB = new Zotero.DBConnection('helloworld');

 if (!this.DB.tableExists('changes')) {
 this.DB.query("CREATE TABLE changes (num INT)");
 this.DB.query("INSERT INTO changes VALUES (0)");
 }

 // Register the callback in Zotero as an item observer
 var notifierID = Zotero.Notifier.registerObserver(this.notifierCallback, ['item']);

 // Unregister callback when the window closes (important to avoid a memory leak)
 window.addEventListener('unload', function (e) {
 Zotero.Notifier.unregisterObserver(notifierID);
 }, false);
 },

 insertHello: function () {
 var data = {
 title: "Zotero",
 company: "Center for History and New Media",
 creators: [
 ['Dan', 'Stillman', 'programmer'],
 ['Simon', 'Kornblith', 'programmer']
 ],
 version: '1.0.1',
 place: 'Fairfax, VA',
 url: 'http://www.zotero.org'
 };
 Zotero.Items.add('computerProgram', data); // returns a Zotero.Item instance
 },

 // Callback implementing the notify() method to pass to the Notifier
 notifierCallback: {
 notify: function (event, type, ids, extraData) {
 if (event == 'add' || event == 'modify' || event == 'delete') {
 // Increment a counter every time an item is changed
 Zotero.HelloWorldZotero.DB.query("UPDATE changes SET num = num + 1");

 if (event != 'delete') {
 // Retrieve the added/modified items as Item objects
 var items = Zotero.Items.get(ids);
 }
 else {
 var items = extraData;
 }

 // Loop through array of items and grab titles
 var titles = [];
 for each(var item
 in
 items
 )
 {
 // For deleted items, get title from passed data
 if (event == 'delete') {
 titles.push(item.old.title ? item.old.title : '[No title]');
 }
 else {
 titles.push(item.getField('title'));
 }
 }

 if (!titles.length) {
 return;
 }

 // Get the localized string for the notification message and
 // append the titles of the changed items
 var stringName = 'notification.item' + (titles.length == 1 ? '' : 's');
 switch (event) {
 case 'add':
 stringName += "Added";
 break;

 case 'modify':
 stringName += "Modified";
 break;

 case 'delete':
 stringName += "Deleted";
 break;
 }

 var str = document.getElementById('hello-world-zotero-strings').getFormattedString(stringName, [titles.length]) + ":\n\n" +
 titles.join("\n");
 }

 var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
 .getService(Components.interfaces.nsIPromptService);
 ps.alert(null, "", str);
 }
 }
 };

 // Initialize the utility
 window.addEventListener('load', function (e) {
 Zotero.HelloWorldZotero.init();
 }, false);
 */