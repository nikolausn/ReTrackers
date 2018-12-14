/**
 * Created by nikolausn on 12/5/18.
 */

if (typeof Zotero === 'undefined') {
    Zotero = {};
}

Zotero.RetracterZotero = {};

Zotero.RetracterZotero.DB = null;

Zotero.RetracterZotero.resetState = function () {
}

Zotero.RetracterZotero.init = function () {
    try{
        // init database
        Zotero.DataDirectory._dir = Zotero.DataDirectory.defaultDir;
        this.DB = new Zotero.DBConnection('retracers');
        //Zotero.debug("retract aha: "+this.DB.tableExists('retracted'));

        // Create retracted table
        this.DB.tableExists("retracted").then(function(resp){
            Zotero.debug("create retracted table "+resp);
            if(!resp){
                try{
                    var test = Zotero.RetracterZotero.DB.queryAsync("CREATE TABLE retracted (item_id text,retracted integer)");

                    test.then(function(resp){
                        Zotero.debug("create retracted table "+resp);
                    }).catch(function(err){
                        Zotero.debug("create retracted table error "+err);
                    });

                }catch(err){
                    Zotero.debug("Retracters: Error create table "+err);
                }
            };
        });

        // Create retracted cache table
        this.DB.tableExists("retracter_cache").then(function(resp){
            Zotero.debug("create retracter_cache table "+resp);
            if(!resp){
                //this.DB.query("CREATE TABLE retracted (item_id text,retracted integer);");
                var test = Zotero.RetracterZotero.DB.queryAsync("CREATE TABLE retracter_cache (title text,doi text,retracted_status text,derived_from text,expiration_date real)");

                test.then(function(resp){
                    Zotero.debug("create retracter_cache table "+resp);
                }).catch(function(err){
                    Zotero.debug("create retracter_cache table error "+err);
                });

            };
        });
    }catch(err){
        Zotero.debug("Retracters: Error create table "+err);
    }

    // Register the callback in Zotero as an item observer
    var notifierID = Zotero.Notifier.registerObserver(this.notifierCallback, ['sync']);
    //var notifierItemChange = Zotero.Notifier.registerObserver(this.notifierItemCallback, ['collection', 'search', 'item', 'collection-item', 'item-tag', 'tag',
    //    'group', 'relation', 'feed', 'feedItem']);

    Zotero.debug('Retracters Plugin, grabbing retracted paper' + notifierID);
    //Zotero.debug('Retracters Plugin, grabbing retracted paper' + notifierItemChange);

    // Unregister callback when the window closes (important to avoid a memory leak)
    window.addEventListener('unload', function (e) {
        Zotero.RetracterZotero.DB.closeDatabase();
        Zotero.Notifier.unregisterObserver(notifierID);
        //Zotero.Notifier.unregisterObserver(notifierItemChange);
    }, false);

    ZoteroPane_Local.itemSelected = function (event) {
        Zotero.debug("Retracter: new item selected event");

        return Zotero.Promise.coroutine(function* () {
            // Don't select item until items list has loaded
            //
            // This avoids an error if New Item is used while the pane is first loading.
            var promise = this.itemsView.waitForLoad();
            if (promise.isPending()) {
                yield promise;
            }

            if (!this.itemsView || !this.itemsView.selection) {
                Zotero.debug("Items view not available in itemSelected", 2);
                return false;
            }

            var selectedItems = this.itemsView.getSelectedItems();

            // Display buttons at top of item pane depending on context. This needs to run even if the
            // selection hasn't changed, because the selected items might have been modified.
            this.updateItemPaneButtons(selectedItems);

            this.updateQuickCopyCommands(selectedItems);

            // Check if selection has actually changed. The onselect event that calls this
            // can be called in various situations where the selection didn't actually change,
            // such as whenever selectEventsSuppressed is set to false.
            var ids = selectedItems.map(item => item.id);
            ids.sort();
            if (ids.length && Zotero.Utilities.arrayEquals(_lastSelectedItems, ids)) {
                return false;
            }
            _lastSelectedItems = ids;

            var tabs = document.getElementById('zotero-view-tabbox');

            // save note when switching from a note
            if (document.getElementById('zotero-item-pane-content').selectedIndex == 2) {
                // TODO: only try to save when selected item is different
                yield document.getElementById('zotero-note-editor').save();
            }

            var collectionTreeRow = this.getCollectionTreeRow();
            // I don't think this happens in normal usage, but it can happen during tests
            if (!collectionTreeRow) {
                return false;
            }

            // Single item selected
            if (selectedItems.length == 1) {
                var item = selectedItems[0];

                if (item.isNote()) {
                    ZoteroItemPane.onNoteSelected(item, this.collectionsView.editable);
                } else

                if (item.isAttachment()) {
                    var attachmentBox = document.getElementById('zotero-attachment-box');
                    attachmentBox.mode = this.collectionsView.editable ? 'edit' : 'view';
                    attachmentBox.item = item;

                    document.getElementById('zotero-item-pane-content').selectedIndex = 3;
                }

                // Regular item
                else {
                    var isCommons = collectionTreeRow.isBucket();

                    document.getElementById('zotero-item-pane-content').selectedIndex = 1;
                    var tabBox = document.getElementById('zotero-view-tabbox');

                    // Reset tab when viewing a feed item, which only has the info tab
                    if (item.isFeedItem) {
                        tabBox.selectedIndex = 0;
                    }

                    var pane = tabBox.selectedIndex;
                    tabBox.firstChild.hidden = isCommons;

                    var button = document.getElementById('zotero-item-show-original');
                    if (isCommons) {
                        button.hidden = false;
                        button.disabled = !this.getOriginalItem();
                    } else
                    {
                        button.hidden = true;
                    }

                    if (this.collectionsView.editable) {
                        yield ZoteroItemPane.viewItem(item, null, pane);
                        tabs.selectedIndex = document.getElementById('zotero-view-item').selectedIndex;
                    } else
                    {
                        yield ZoteroItemPane.viewItem(item, 'view', pane);
                        tabs.selectedIndex = document.getElementById('zotero-view-item').selectedIndex;
                    }

                    if (item.isFeedItem) {
                        // Too slow for now
                        // if (!item.isTranslated) {
                        // 	item.translate();
                        // }
                        this.updateReadLabel();
                        this.startItemReadTimeout(item.id);
                    }
                }
            }
            // Zero or multiple items selected
            else {
                if (collectionTreeRow.isFeed()) {
                    this.updateReadLabel();
                }

                let count = selectedItems.length;

                // Display duplicates merge interface in item pane
                if (collectionTreeRow.isDuplicates()) {
                    if (!collectionTreeRow.editable) {
                        if (count) {
                            var msg = Zotero.getString('pane.item.duplicates.writeAccessRequired');
                        } else
                        {
                            var msg = Zotero.getString('pane.item.selected.zero');
                        }
                        this.setItemPaneMessage(msg);
                    } else
                    if (count) {
                        document.getElementById('zotero-item-pane-content').selectedIndex = 4;

                        // Load duplicates UI code
                        if (typeof Zotero_Duplicates_Pane == 'undefined') {
                            Zotero.debug("Loading duplicatesMerge.js");
                            Components.classes["@mozilla.org/moz/jssubscript-loader;1"].
                            getService(Components.interfaces.mozIJSSubScriptLoader).
                            loadSubScript("chrome://zotero/content/duplicatesMerge.js");
                        }

                        // On a Select All of more than a few items, display a row
                        // count instead of the usual item type mismatch error
                        var displayNumItemsOnTypeError = count > 5 && count == this.itemsView.rowCount;

                        // Initialize the merge pane with the selected items
                        Zotero_Duplicates_Pane.setItems(selectedItems, displayNumItemsOnTypeError);
                    } else
                    {
                        var msg = Zotero.getString('pane.item.duplicates.selectToMerge');
                        this.setItemPaneMessage(msg);
                    }
                }
                // Display label in the middle of the item pane
                else {
                    if (count) {
                        var msg = Zotero.getString('pane.item.selected.multiple', count);
                    } else
                    {
                        var rowCount = this.itemsView.rowCount;
                        var str = 'pane.item.unselected.';
                        switch (rowCount) {
                            case 0:
                                str += 'zero';
                                break;
                            case 1:
                                str += 'singular';
                                break;
                            default:
                                str += 'plural';
                                break;}

                        var msg = Zotero.getString(str, [rowCount]);
                    }

                    this.setItemPaneMessage(msg);

                    return false;
                }
            }

            return true;
        }.bind(this))().
        catch(function (e) {
            Zotero.logError(e);
            this.displayErrorMessage();
            throw e;
        }.bind(this)).
        finally(function () {
            var item_box = document.getElementById('zotero-editpane-item-box');
            Zotero.debug("Document: " + JSON.stringify(item_box));
            Zotero.debug("Item Type Id: " + item_box.item.itemTypeID);
            var titleFieldID = Zotero.ItemFields.getFieldIDFromTypeAndBase(item_box.item.itemTypeID, 'title');
            var field = item_box._dynamicFields.getElementsByAttribute('fieldname', Zotero.ItemFields.getName(titleFieldID)).item(0);
            //var field = item_box.getElementsByAttribute('fieldname', "itemType").item(0);
            //Zotero.debug("field: " + JSON.stringify(field));
            let label = document.createElement("label");
            label.setAttribute('fieldname', "Retracted");
            label.setAttribute('value',"Retracted")
            label.setAttribute('style',"color:red")
            let valueElement = document.createElement("label");
            valueElement.setAttribute('fieldname', "RetractedVal");
            valueElement.setAttribute('value',"This Paper is Retracted")
            valueElement.setAttribute('style',"color:red")
            //valueElement.removeEventListener('click');
            //item_box.addDynamicRow(label,valueElement,field)
            /*
            var row = document.createElement("row");
            row.appendChild(label);
            row.appendChild(valueElement);
            item_box.insertBefore(row, field)
            */
            row = item_box.addDynamicRow(label,valueElement,field);
            Zotero.debug("Row: " + label.toSource());

            return this.itemsView.runListeners('select');
        }.bind(this));
    };


};

/*
 checking retracted items whenever sync button executed
 using notifierCallback on item observer
 */

Zotero.RetracterZotero.notifierItemCallback = {
    notify: function (event, type, ids, extraData) {
        Zotero.debug("Retracter item event: " + event);
        Zotero.debug("Retracter item type: " + type);
        Zotero.debug("Retracter item ids: " + ids);
        //var item_box = document.getElementById("item-box");
        //Zotero.debug("Document: " + JSON.stringify(item_box));
    }
}

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
                var localResp = JSON.parse(JSON.stringify(response));
                //Zotero.debug("Retracter fetching item: " + response.toSource());
                Zotero.debug("Retracter fetching item: " + JSON.stringify(localResp));
                Zotero.debug("Retracter title: "+ localResp.title);
                Zotero.debug("fetch retraction data");

                /*
                if(localResp.hasOwnProperty("DOI")&&localResp.hasOwnProperty("title")){
                    //const url = "http://retractiondatabase.org/RetractionSearch.aspx#?ttl=" + localResp["title"];
                    //const url = "http://retractiondatabase.org/RetractionSearch.aspx";
                    const url = 'https://www.ncbi.nlm.nih.gov/pubmed/?term="'+localResp.title+'"';

                    var xhr = new XMLHttpRequest();
                    //xhr.open('POST', url, true);
                    xhr.open('GET', url, true);

                    // If specified, responseType must be empty string or "text"
                    xhr.responseType = 'text';
                    xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');


                    xhr.onload = function () {
                        if (xhr.readyState === xhr.DONE) {
                            if (xhr.status === 200) {
                                //Zotero.debug("Retracter resp: "+xhr.response);
                                Zotero.debug("Retracter text: "+localResp.title+" "+xhr.responseText);
                            }
                        }
                    };
                    //xhr.send("txtSrchTitle="+localResp["title"]);
                    xhr.send(null);
                }
                */



                /*
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
                */
        }));

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