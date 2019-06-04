/**
 * Created by nikolausn on 12/5/18.
 */

if (typeof Zotero === 'undefined') {
    Zotero = {};
}

var open_url = function(url){
    //window.open(url, 'retraction_source',null,true);
    //return false;
    Zotero.debug("Retracter, source window 1: "+typeof(window.source_window));
    if(typeof(window.source_window)==="undefined"){
        window.source_window = window.open(url,"source_window");
    }else{
        try{
            window.source_window.close();
        }catch(ex){
            Zotero.debug(ex);
        }
        window.source_window = window.open(url,"source_window");
        /*
        try{
            Zotero.debug("Retracter, source window 2: "+window.source_window);
            window.source_window.open(url,"source_window",undefined,true);
            window.source_window.focus();
        }catch(ex){
            window.source_window = window.open(url,"source_window");
        }
        */
    }
    return true;
}

Zotero.RetracterZotero = {};

Zotero.RetracterZotero.DB = null;

Zotero.RetracterZotero.resetState = function () {
}

Zotero.RetracterZotero.init = function () {
    try {
        // init database
        this.DB = new Zotero.DBConnection('retrackersv101');
        //Zotero.debug("retract aha: "+this.DB.tableExists('retracted'));

        // Create retracted table
        this.DB.tableExists("retracted").then(function (resp) {
            Zotero.debug("create retracted table " + resp);
            if (!resp) {
                try {
                    var test = Zotero.RetracterZotero.DB.queryAsync("CREATE TABLE retracted (item_id text,retracted integer)");

                    test.then(function (resp) {
                        Zotero.debug("create retracted table " + resp);
                    }).catch(function (err) {
                        Zotero.debug("create retracted table error " + err);
                    });

                } catch (err) {
                    Zotero.debug("Retracters: Error create table " + err);
                }
            }
            ;
        });

        // Create retracted cache table
        this.DB.tableExists("retracter_cache").then(function (resp) {
            Zotero.debug("create retracter_cache table " + resp);
            if (!resp) {
                //this.DB.query("CREATE TABLE retracted (item_id text,retracted integer);");
                var test = Zotero.RetracterZotero.DB.queryAsync("CREATE TABLE retracter_cache (title text,doi text,retracted_status text,derived_from text,expiration_date real)");

                test.then(function (resp) {
                    Zotero.debug("create retracter_cache table " + resp);
                }).catch(function (err) {
                    Zotero.debug("create retracter_cache table error " + err);
                });

            }
            ;
        });
    } catch (err) {
        Zotero.debug("Retracters: Error create table " + err);
    }

    // Register the callback in Zotero as an item observer
    let notifierID = Zotero.Notifier.registerObserver(this.notifierCallback, ['sync']);
    let notifierItemUpdateID = Zotero.Notifier.registerObserver(this.notifierItemUpdateCallback, ['item']);

    Zotero.debug('Retracters Plugin, grabbing retracted paper' + notifierID);
    //Zotero.debug('Retracters Plugin, grabbing retracted paper' + notifierItemChange);

    //Zotero.debug('Retracters Local Data: '+local_data[0]);
    // Unregister callback when the window closes (important to avoid a memory leak)
    window.addEventListener('unload', function (e) {
        Zotero.RetracterZotero.DB.closeDatabase();
        Zotero.Notifier.unregisterObserver(notifierID);
        Zotero.Notifier.unregisterObserver(notifierItemUpdateID);
    }, false);


    // adapted from the original ZoteroPane.js
    //https://github.com/zotero/zotero/blob/master/chrome/content/zotero/zoteroPane.js

    // look at different approach that we can use
    // maybe using listener

    ZoteroPane_Local.itemSelected = function (event) {
        Zotero.debug("Retracter: new item selected event");

        return Zotero.Promise.coroutine(function*() {
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
                } else if (item.isAttachment()) {
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
                    } else {
                        button.hidden = true;
                    }

                    if (this.collectionsView.editable) {
                        yield ZoteroItemPane.viewItem(item, null, pane);
                        tabs.selectedIndex = document.getElementById('zotero-view-item').selectedIndex;
                    } else {
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
                        } else {
                            var msg = Zotero.getString('pane.item.selected.zero');
                        }
                        this.setItemPaneMessage(msg);
                    } else if (count) {
                        document.getElementById('zotero-item-pane-content').selectedIndex = 4;

                        // Load duplicates UI code
                        if (typeof Zotero_Duplicates_Pane == 'undefined') {
                            Zotero.debug("Loading duplicatesMerge.js");
                            Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(Components.interfaces.mozIJSSubScriptLoader).loadSubScript("chrome://zotero/content/duplicatesMerge.js");
                        }

                        // On a Select All of more than a few items, display a row
                        // count instead of the usual item type mismatch error
                        var displayNumItemsOnTypeError = count > 5 && count == this.itemsView.rowCount;

                        // Initialize the merge pane with the selected items
                        Zotero_Duplicates_Pane.setItems(selectedItems, displayNumItemsOnTypeError);
                    } else {
                        var msg = Zotero.getString('pane.item.duplicates.selectToMerge');
                        this.setItemPaneMessage(msg);
                    }
                }
                // Display label in the middle of the item pane
                else {
                    if (count) {
                        var msg = Zotero.getString('pane.item.selected.multiple', count);
                    } else {
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
                                break;
                        }

                        var msg = Zotero.getString(str, [rowCount]);
                    }

                    this.setItemPaneMessage(msg);

                    return false;
                }
            }

            return true;
        }.bind(this))().catch(function (e) {
            Zotero.logError(e);
            this.displayErrorMessage();
            throw e;
        }.bind(this)).finally(async function () {
            try{
                let item_box = document.getElementById('zotero-editpane-item-box');
                Zotero.debug("Retracter Document: " + JSON.stringify(item_box.item));
                Zotero.debug("Retracter Item Type Id: " + item_box.item.itemTypeID);

                let item_check = await Zotero.RetracterZotero.DB.queryAsync("SELECT * FROM retracted WHERE item_id=?",item_box.item.key);

                if(item_check.length>0){
                    let item_temp = JSON.parse(JSON.stringify(item_box.item));
                    let cache_check = await Zotero.RetracterZotero.selectRetracterCache(item_temp.title);
                    // If item is retracted, set label on item info pane

                    // add definition for retraction on title
                    let retracted_on_title = false;
                    let item_selected = JSON.parse(JSON.stringify(item_box.item));

                    Zotero.debug("Retracter Item Title: " + item_selected.title);

                    /*
                    if (item_selected.title.toLowerCase().startsWith("retract")){
                        retracted_on_title = true;
                    }
                    */

                    let retracted_from = "U";
                    if(cache_check.length>0){
                        retracted_from = cache_check[0]["derived_from"];
                    }

                    if(item_check[0]["retracted"]==="R"||retracted_on_title){
                        let titleFieldID = Zotero.ItemFields.getFieldIDFromTypeAndBase(item_box.item.itemTypeID, 'title');
                        let field = item_box._dynamicFields.getElementsByAttribute('fieldname', Zotero.ItemFields.getName(titleFieldID)).item(0);
                        //var field = item_box.getElementsByAttribute('fieldname', "itemType").item(0);
                        //Zotero.debug("field: " + JSON.stringify(field));
                        let label = document.createElement("label");
                        label.setAttribute('fieldname', "Retracted");
                        label.setAttribute('value', "Retracted")
                        label.setAttribute('style', "color:red")
                        let valueElement = document.createElement("div");
                        valueElement.setAttribute('fieldname', "RetractedVal");
                        //valueElement.setAttribute('value', "This Paper is Retracted")
                        valueElement.setAttribute('style', "color:red")
                        valueElement.appendChild(document.createTextNode("This document has been Retracted "));

                        let newLink = document.createElement('label');
                        newLink.className = 'zotero-clicky';
                        newLink.appendChild(document.createTextNode("[source]"));

                        // add hyperlink for retracter source
                        let url = false;

                        Zotero.debug("Retracter, Retracted From: "+retracted_from);

                        if(retracted_from==="L"){
                            // from retraction_watch_db
                            url = "http://retractiondatabase.org/RetractionSearch.aspx#?ttl="+item_temp.title;
                            //url = "http://retractiondatabase.org/RetractionSearch.aspx";
                        }else if(retracted_from=="P"){
                            //from pubmed
                            url = "https://www.ncbi.nlm.nih.gov/pubmed/?term="+item_temp.title;
                        }
                        if(url) {
                            // set attribute for the url if retracted from exist
                            newLink.setAttribute("onclick",
                                "open_url('"+url+"')");
                            valueElement.appendChild(newLink);
                        }
                        //valueElement.removeEventListener('click');
                        //item_box.addDynamicRow(label,valueElement,field)
                        /*
                         var row = document.createElement("row");
                         row.appendChild(label);
                         row.appendChild(valueElement);
                         item_box.insertBefore(row, field)
                         */
                        row = item_box.addDynamicRow(label, valueElement, field);
                        //Zotero.debug("Row: " + label.toSource());
                    }
                }
            }catch(err){
                    Zotero.debug("Retracter Fetch Item Error: "+err);
            }

            return this.itemsView.runListeners('select');
        }.bind(this));
    };
};

/*
 checking retracted items whenever sync button executed
 using notifierCallback on item observer
 */


Zotero.RetracterZotero.notifierItemUpdateCallback = {
    notify: async function (event, type, ids, extraData) {
        Zotero.debug("Retracter item update event: " + event);
        Zotero.debug("Retracter item update type: " + type);
        Zotero.debug("Retracter item update ids: " + ids);
        //var item_box = document.getElementById("item-box");
        //Zotero.debug("Document: " + JSON.stringify(item_box));

        if (event === "modify" || event == "add") {
            let item = await Zotero.Items.get(ids[0]);
            item = JSON.parse(JSON.stringify(item));
            let itemDOI = null;
            if(localResp.hasOwnProperty("DOI")){
                itemDOI = localResp.DOI;
            }
            Zotero.debug("Retracted item update: " + JSON.stringify(item));
            if (item.hasOwnProperty("title")) {
                await Zotero.RetracterZotero.checkRetracted(item.key, item.title, itemDOI);
            }
        }
    }
}

Zotero.RetracterZotero.selectRetracterCache = function(title){
    let params = [title];
    return Zotero.RetracterZotero.DB.queryAsync("SELECT * FROM retracter_cache WHERE title=?",params);
}

Zotero.RetracterZotero.selectRetracted = function(itemId){
    let params = [itemId];
    return Zotero.RetracterZotero.DB.queryAsync("SELECT * FROM retracted WHERE item_id=?",params)
}

Zotero.RetracterZotero.updateRetracterCache = function(title,retractedStatus,derivedFrom,expirationDate){
    let params = [retractedStatus,derivedFrom,expirationDate,title];
    return Zotero.RetracterZotero.DB.queryAsync("UPDATE retracter_cache SET retracted_status=?,derived_from=?,expiration_date=? WHERE title=?",params);
}

Zotero.RetracterZotero.updateRetracted= function(itemId,retracted){
    let params = [retracted,itemId];
    return Zotero.RetracterZotero.DB.queryAsync("UPDATE retracted set retracted=? WHERE item_id=?",params);
}

Zotero.RetracterZotero.insertRetracted= function(itemId,retracted){
    let params = [itemId,retracted];
    return Zotero.RetracterZotero.DB.queryAsync("INSERT INTO retracted VALUES (?,?)",params);
}

Zotero.RetracterZotero.insertRetractedCache= function(title,doi,retractedStatus,derivedFrom,expirationDate){
    let params = [title,doi,retractedStatus,derivedFrom,expirationDate];
    return Zotero.RetracterZotero.DB.queryAsync("INSERT INTO retracter_cache VALUES (?,?,?,?,?)",params)
}

Zotero.RetracterZotero.matchOnlyAlphabeticalValues= function(str1,str2){
    let tStr1 = str1.toLowerCase().replace(/\W/g, '');
    let tStr2 = str2.toLowerCase().replace(/\W/g, '');
    return (tStr1===tStr2);
}

Zotero.RetracterZotero.onlyAlphabeticalValues= function(str1){
    return str1.toLowerCase().replace(/\W/g, '');
}

Zotero.RetracterZotero.cleanForKeyword= function(str1){
    // replace characters other than word digit and whitespace to a space
    return str1.toLowerCase().replace(/[^\w|\d|\s]/g, ' ');
}

/*
Zotero.RetracterZotero.findFromPubmed = Zotero.Promise.coroutine(function* (title,doi){
     // Check Pubmed
     const url = 'https://www.ncbi.nlm.nih.gov/pubmed/?term="'+title+'"';

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
                //Zotero.debug("Retracter text: "+localResp.title+" "+xhr.responseText);
                var xhrResp = yield xhr.responseText;
             }
         }else{
             var xhrResp = yield false;
         }
     };
     //xhr.send("txtSrchTitle="+localResp["title"]);
     xhr.send(null);
});
*/


Zotero.RetracterZotero.requestPage = async function(url) {
    var returnPromise = new Zotero.Promise(function(resolve,reject){
        let xhr = new XMLHttpRequest();
        //xhr.open('POST', url, true);
        xhr.open('GET', url, true);

        // If specified, responseType must be empty string or "text"
        xhr.responseType = 'text';
        xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');


        xhr.onload = function () {
            if (xhr.readyState === xhr.DONE) {
                if (xhr.status === 200) {
                    resolve({"page": xhr.responseText});
                }
            }
            resolve(false);
        }
        xhr.send(null);
    });

    return returnPromise;
}

Zotero.RetracterZotero.searchText = function(listText,text){
    let retractedFound = false;
    let titleANOnly = Zotero.RetracterZotero.onlyAlphabeticalValues(text);
    let outputElement = [];
    if(listText.length>0){
        for(let i=0;i<listText.length;i++){
            // check the title, before and after
            let responseText = Zotero.RetracterZotero.onlyAlphabeticalValues(listText[i].innerText);
            let responseLength = responseText.length;
            let titleLength = titleANOnly.length;
            let titleIndex = responseText.indexOf(titleANOnly);
            // title not found, then just continue to the next rprt
            if(titleIndex<0){
                continue;
            }

            outputElement.push(listText[i])

            let startCut = titleIndex;
            let endCut = titleIndex+titleLength;
            let checkText = responseText.substr(0,startCut)+responseText.substr(endCut,responseLength);
            if(checkText.toLowerCase().indexOf("retract")>=0){
                retractedFound = true;
                // Retracted text found, break the loop
                break;
            }
        }
    }

    return [retractedFound,outputElement]
}

Zotero.RetracterZotero.findPubmedSinglePage = async function(url,title){
    let retractedFound=false;
    Zotero.debug("search Single Page: " + url);
    let searchPage1 = await Zotero.RetracterZotero.requestPage(url);
    let parser = new DOMParser();
    if(searchPage1){
        let el = parser.parseFromString(searchPage1["page"], "text/xml");
        let alertBox = el.getElementsByClassName("retracted-alert");
        if (alertBox.length>0){
            retractedFound=true;
        }
    }
    return retractedFound;
}


Zotero.RetracterZotero.findFromPubmed = function(title,doi){
    // Check Pubmed
    var returnPromise = new Zotero.Promise(async function(resolve,reject){
        // Tokenize title

        //Zotero.debug("Retracter test token search: " + titleSearch);

        let searchKeywords = Zotero.RetracterZotero.cleanForKeyword(title);

        const url = 'https://www.ncbi.nlm.nih.gov/pubmed/?term="'+searchKeywords+'"';
        //const url = 'https://www.ncbi.nlm.nih.gov/pubmed/?term='+titleSearch+'';

        Zotero.debug("Retracter search PUBMED: " + url);

        let searchPage1 = await Zotero.RetracterZotero.requestPage(url);

        let retractedFound = false;

        if(searchPage1) {
            let parser = new DOMParser();
            let el = parser.parseFromString(searchPage1["page"], "text/xml");

            //let titleANOnly = Zotero.RetracterZotero.onlyAlphabeticalValues(title);

            // If it is in advance box
            let advanced_box = el.getElementsByClassName("sensor");
            if(advanced_box.length>0){
                advanced_box = advanced_box[0].getElementsByTagName("p");
            }
            let advanced_result = Zotero.RetracterZotero.searchText(advanced_box,title);

            // if retraction keyword found in advanced box
            if (advanced_result[0]){
                Zotero.debug("Retracted Pubmed found in advanced result");
                retractedFound = true;
            }else{
                // no advanced box
                if(advanced_result[1].length===0){
                    // try looking on the find report page
                    let rprts_box = el.getElementsByClassName("rslt");
                    let rprts_result = Zotero.RetracterZotero.searchText(rprts_box,title);

                    // if retraction keyword found in report result
                    if(rprts_result[0]){
                        Zotero.debug("Retracted Pubmed found in report result");
                        retractedFound = true;
                    }else{
                        // There is no result box
                        if(rprts_result[1].length===0){
                            // Check alert box if it is one page case
                            let alertBox = el.getElementsByClassName("retracted-alert");
                            if (alertBox.length>0){
                                Zotero.debug("Retracted Pubmed found in single page");
                                retractedFound=true;
                            }
                        }else{
                            // there are several page related to the title
                            Zotero.debug("search Single Page Pubmed length: " + rprts_result[1].length + " element: "+rprts_result[1]);

                            for(let i=0;i<rprts_result[1].length;i++){
                                let advHyperLink = rprts_result[1][i].getElementsByTagName("a");
                                if(advHyperLink.length>0){
                                    // check retraction on page
                                    let url = "https://www.ncbi.nlm.nih.gov"+advHyperLink[0].getAttribute("href");
                                    Zotero.debug("search Single Page Pubmed from result: " + url);
                                    retractedFound = await Zotero.RetracterZotero.findPubmedSinglePage(url, title);
                                    if(retractedFound){
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }else{
                    //there is an advanced box related to the title
                    Zotero.debug("search Single Page Pubmed from length: " + advanced_result[1].length);
                    for(let i=0;i<advanced_result[1].length;i++){
                        let advHyperLink = advanced_result[1][i].getElementsByTagName("a");
                        if(advHyperLink.length>0){
                            // check retraction on page
                            let url = "https://www.ncbi.nlm.nih.gov"+advHyperLink[0].getAttribute("href");
                            Zotero.debug("search Single Page Pubmed from advanced box: " + url);
                            retractedFound = await Zotero.RetracterZotero.findPubmedSinglePage(url, title);
                            if(retractedFound){
                                break;
                            }
                        }
                    }
                }
            }
        }
        resolve({"retracted": retractedFound});

    });

    return returnPromise;
};

Zotero.RetracterZotero.findFromPubmedOld = function(title,doi){
    // Check Pubmed
    var returnPromise = new Zotero.Promise(function(resolve,reject){
        // Tokenize title

        /*
        let yuhuTitle = title.split(" ");

        //titleAlphaOnly = titleAlphaOnly.split(" ");

        let titleSearch = ""
        for(let i = 0; i < yuhuTitle.length; i++) {
            let titleAlphaOnly = Zotero.RetracterZotero.onlyAlphabeticalValues(yuhuTitle[i]);
            // Trim the excess whitespace.
            titleSearch = titleSearch + titleAlphaOnly+"[Title]";
            if (i<yuhuTitle.length-1){
                titleSearch = titleSearch + "+AND+"
            }
        }
        */

        //Zotero.debug("Retracter test token search: " + titleSearch);

        const url = 'https://www.ncbi.nlm.nih.gov/pubmed/?term="'+title+'"';
        //const url = 'https://www.ncbi.nlm.nih.gov/pubmed/?term='+titleSearch+'';

        Zotero.debug("Retracter test token search: " + url);

        let xhr = new XMLHttpRequest();
        //xhr.open('POST', url, true);
        xhr.open('GET', url, true);

        // If specified, responseType must be empty string or "text"
        xhr.responseType = 'text';
        xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');


        xhr.onload = function () {
            if (xhr.readyState === xhr.DONE) {
                if (xhr.status === 200) {
                    //Zotero.debug("Retracter resp: "+xhr.response);
                    //Zotero.debug("Retracter text: "+localResp.title+" "+xhr.responseText);

                    let parser = new DOMParser();
                    let el = parser.parseFromString(xhr.responseText, "text/xml");


                    let retractedFound = false;
                    //let pubmedFound = false;
                    let titleANOnly = Zotero.RetracterZotero.onlyAlphabeticalValues(title);

                    let advanced_box = el.getElementsByClassName("sensor");
                    if(advanced_box.length > 0){
                        let rpr_title = advanced_box[0].getElementsByTagName("p");
                        for(let i=0;i<rpr_title.length;i++){
                            // check the title, before and after
                            let responseText = Zotero.RetracterZotero.onlyAlphabeticalValues(rpr_title[i].innerText);
                            let responseLength = responseText.length;
                            let titleLength = titleANOnly.length;
                            let titleIndex = responseText.indexOf(titleANOnly);
                            // title not found, then just continue to the next rprt
                            if(titleIndex<0){
                                continue;
                            }

                            let startCut = titleIndex;
                            let endCut = titleIndex+titleLength;
                            let checkText = responseText.substr(0,startCut)+responseText.substr(endCut,responseLength);
                            if(checkText.toLowerCase().indexOf("retract")>=0){
                                retractedFound = true;
                                // Retracted text found, break the loop
                                break;
                            }
                        }
                    }

                    if(!retractedFound) {
                        let rprts = el.getElementsByClassName("rprt");
                        for (let i = 0; i < rprts.length; i++) {
                            // check the title, before and after
                            let responseText = Zotero.RetracterZotero.onlyAlphabeticalValues(rprts[i].innerText);
                            let responseLength = responseText.length;
                            let titleLength = titleANOnly.length;
                            let titleIndex = responseText.indexOf(titleANOnly);
                            // title not found, then just continue to the next rprt
                            if (titleIndex < 0) {
                                continue;
                            }

                            let startCut = titleIndex;
                            let endCut = titleIndex + titleLength;
                            let checkText = responseText.substr(0, startCut) + responseText.substr(endCut, responseLength);
                            if (checkText.toLowerCase().indexOf("retract") >= 0) {
                                retractedFound = true;
                                // Retracted text found, break the loop
                                break;
                            }
                        }
                    }

                    resolve({"retracted": retractedFound});
                }
            }else{
                resolve(false);
            }
        };
        //xhr.send("txtSrchTitle="+localResp["title"]);
        xhr.send(null);
    });

    return returnPromise;
};

Zotero.RetracterZotero.findFromLocal = function(title,doi){
    return local_data.filter(x => Zotero.RetracterZotero.onlyAlphabeticalValues(x) == Zotero.RetracterZotero.onlyAlphabeticalValues(title)).length > 0;
};

Zotero.RetracterZotero.syncApi = async function(title,doi){
    var find = "U";
    var find_from = "U";
    var now = new Date();

    /*
    if (local_data.indexOf(title) >= 0) {
        find = "R";
        find_from = "L"
    }
    */

    /*
    Drop function to check from local title
     */

    /*
    if (Zotero.RetracterZotero.findFromLocal(title)){
        find = "R";
        find_from = "L"
    }
    */

    //if not found in local, check pubmed
    if (find == "U") {
        var pubmedResult = await Zotero.RetracterZotero.findFromPubmed(title, doi);
        if(pubmedResult){
            if(pubmedResult["retracted"]) {
                find = "R";
                find_from = "P";
            }
        }
        Zotero.debug("Retracter Pubmed "+title+" : "+ JSON.stringify(pubmedResult));
        //"Visual evaluation of train-of-four and double burst stimulation, fade at various currents, using a rubber band",
    }
    return {"find": find,"findFrom": find_from};
}

Zotero.RetracterZotero.checkRetracted = async function(itemId,title,doi) {
    // Check from retracted table if the itemId exist
    let item_check = await Zotero.RetracterZotero.DB.queryAsync("SELECT * FROM retracted WHERE item_id=?",[itemId]);
    Zotero.debug("Retracter item check: "+item_check.length);
    if(item_check.length>0){
        // if found, query return rows
        // Zotero.RetracterZotero.DB.queryAsync("CREATE TABLE retracted (item_id text,retracted integer)");
        //CREATE TABLE retracter_cache (title text,doi text,retracted_status text,derived_from text,expiration_date real)
        //if(item_check[0]["retracted"]=="U") {
            // if unknown
            // look at the retraction cache
            let params = [title];
            // Check in the retracter cache
            let items = await Zotero.RetracterZotero.DB.queryAsync("SELECT * FROM retracter_cache WHERE title=?", params);

            let find = "U";
            let find_from = "U";
            let now = new Date();
            if (items.length > 0) {
                // If title found in the cache
                // Check expiration
                if (now.getTime() > items[0]["expiration_date"]) {
                    // If expired
                    // check local data

                    /*
                    if (local_data.indexOf(title) >= 0) {
                        find = "R";
                        find_from = "L"
                    }
                    //if not found in local, check pubmed
                    if (find == "U") {
                        var xhrText = await Zotero.RetracterZotero.findFromPubmed(title, doi);
                        Zotero.debug("Retracter " + title + ": " + xhrText);
                    }
                    */
                    let result = await Zotero.RetracterZotero.syncApi(title,doi);
                    find = result["find"];
                    find_from = result["findFrom"];

                    // Refresh expiration date
                    now.setDate(now.getDate() + 7);

                    // Update retracter cache
                    await Zotero.RetracterZotero.updateRetracterCache(title, find, find_from, now.getTime());
                    // Update retracted
                    await Zotero.RetracterZotero.updateRetracted(itemId, find);
                } else {
                    // If not expired
                    // set the find and find_from from the items
                    find = items[0]["retracted_status"];
                    // Update retracted
                    await Zotero.RetracterZotero.updateRetracted(itemId, find);
                }
            } else {
                // if it's not in cache

                let result = await Zotero.RetracterZotero.syncApi(title,doi);
                find = result["find"];
                find_from = result["findFrom"];

                /*
                if (local_data.indexOf(title) >= 0) {
                    find = "R";
                    find_from = "L"
                }
                //if not found in local, check pubmed
                if (find == "U") {
                    var xhrText = await Zotero.RetracterZotero.findFromPubmed(title, doi);
                    Zotero.debug("Retracter " + title + ": " + xhrText);
                }
                */

                // Refresh expiration date
                now.setDate(now.getDate() + 7);

                // Update retracter cache
                await Zotero.RetracterZotero.insertRetractedCache(title, doi, find, find_from, now.getTime());
                // Update retracted
                await Zotero.RetracterZotero.updateRetracted(itemId, find);
            }
        //}
    }else{
        // if not found in the item
        // check local data


        let result = await Zotero.RetracterZotero.syncApi(title,doi);
        print("Retracters from sync: "+JSON.stringify(result));
        let find = result["find"];
        let find_from = result["findFrom"];

        /*
        var find = "U";
        var find_from = "U";

        if(local_data.indexOf(title)>=0){
            find = "R";
            find_from = "L"
        }
        //if not found in local, check pubmed
        if(find=="U"){
            var xhrText = await Zotero.RetracterZotero.findFromPubmed(title,doi);
            Zotero.debug("Retracter "+title+": "+xhrText);
        }
        */

        // set expiration date for cache
        let d = new Date();
        // add 7 days for expiration time
        d.setDate(d.getDate()+7);

        await Zotero.RetracterZotero.insertRetractedCache(title,doi,find,find_from,d.getTime());
        await Zotero.RetracterZotero.insertRetracted(itemId,find);
        //CREATE TABLE retracter_cache (title text,doi text,retracted_status text,derived_from text,expiration_date real)
    }
}



Zotero.RetracterZotero.checkRetractedOld = function(itemId,title,doi) {
    // Check from retracted table if the itemId exist
    Zotero.RetracterZotero.DB.queryAsync("SELECT * FROM retracted WHERE item_id=?",itemId).then(async function(item_check){
        Zotero.debug("Retracter item check: "+item_check.length);
        if(item_check.length>0){
            //if found
            // Zotero.RetracterZotero.DB.queryAsync("CREATE TABLE retracted (item_id text,retracted integer)");
            if(item_check[0]["retracted"]=="U"){
                // if unknown
                // look at the retraction cache
                var params = [title];
                // Check in the retracter cache
                Zotero.RetracterZotero.DB.queryAsync("SELECT * FROM retracter_cache WHERE title=?",params).then(async function(items){
                    if(items.length>0){
                        // Check expiration
                        var now = new Date();
                        if(now.getTime()>items[0]["expiration_date"]){
                            // check local data
                            var find = "U";
                            var find_from = "U";

                            if(local_data.indexOf(title)>=0){
                                find = "R";
                                find_from = "L"
                            }

                            //if not found in local, check pubmed
                            if(find=="U"){
                                /*
                                Zotero.RetracterZotero.findFromPubmed(title,doi).then(function(xhrText){
                                    if(xhrText){
                                        Zotero.debug("Retracter "+title+": "+xhrText);
                                    }
                                });
                                */
                                var xhrText = await Zotero.RetracterZotero.findFromPubmed(title,doi);
                                Zotero.debug("Retracter "+title+": "+xhrText);
                            }

                            // Refresh expiration date
                            now.setDate(now.getDate()+7);

                            //var params = [find,find_from,now.getTime(),localResp.title];
                            //Zotero.RetracterZotero.DB.queryAsync("UPDATE retracter_cache SET retracted_status=?,derived_from=?,expiration_date=? WHERE title=?",params)
                            Zotero.RetracterZotero.updateRetracterCache(localResp.title,find,find_from,now.getTime());
                            //var params = [find,localResp.key];
                            //Zotero.RetracterZotero.DB.queryAsync("UPDATE retracted set retracted=? WHERE item_id=?",params)
                            Zotero.RetracterZotero.updateRetracted(localResp.key,find);
                        }
                    }
                });
            }
        }else{
            // if not found
            // check local data
            var find = "U";
            var find_from = "U";

            if(local_data.indexOf(title)>=0){
                find = "R";
                find_from = "L"
            }

            if(find=="U"){
                /*
                Zotero.RetracterZotero.findFromPubmed(title,doi).then(function(xhrText){
                    if(xhrText){
                        Zotero.debug("Retracter "+title+": "+xhrText);
                    }
                });
                */

               var xhrText = await Zotero.RetracterZotero.findFromPubmed(title,doi);
               Zotero.debug("Retracter "+title+": "+xhrText);
            }
            // set expiration date for cache
            var d = new Date();
            // add 7 days for expiration time
            d.setDate(d.getDate()+7);

            //var params = [localResp.title,localResp.DOI,find,find_from,d.getTime()];
            //Zotero.RetracterZotero.DB.queryAsync("INSERT INTO retracter_cache VALUES (?,?,?,?,?)",params)
            Zotero.RetracterZotero.insertRetractedCache(title,doi,find,find_from,d.getTime());
            //var params = [localResp.key,find];
            //Zotero.RetracterZotero.DB.queryAsync("INSERT INTO retracted VALUES (?,?)",params)
            Zotero.RetracterZotero.insertRetracted(itemId,find);
            //CREATE TABLE retracter_cache (title text,doi text,retracted_status text,derived_from text,expiration_date real)
        }
    });
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
            //Zotero.debug("Retracter fetching item: " + JSON.stringify(localResp));
            Zotero.debug("Retracter title: " + localResp.title);
            Zotero.debug("fetch retraction data");

            let itemDOI = null;
            if(localResp.hasOwnProperty("DOI")){
                itemDOI = localResp.DOI;
            }

            if (localResp.hasOwnProperty("title")) {
                try {
                    Zotero.RetracterZotero.checkRetracted(localResp.key, localResp.title, itemDOI);
                    /*

                     // Check the item with retracted local database
                     Zotero.RetracterZotero.DB.queryAsync("SELECT * FROM retracted WHERE item_id=?",localResp.key).then(function(item_check){
                     Zotero.debug("Retracter item check: "+item_check.length);
                     if(item_check.length>0){
                     //if found
                     // Zotero.RetracterZotero.DB.queryAsync("CREATE TABLE retracted (item_id text,retracted integer)");
                     if(item_check[0]["retracted"]=="U"){
                     // look at the retraction cache
                     var params = [localResp.title];
                     Zotero.RetracterZotero.DB.queryAsync("SELECT * FROM retracter_cache WHERE title=?",params).then(function(items){
                     if(items.length>0){
                     // Check expiration
                     var now = new Date();
                     if(now.getTime()>items[0]["expiration_date"]){
                     // check local data
                     var find = "U";
                     var find_from = "U";

                     if(local_data.indexOf(localResp["title"])>=0){
                     find = "R";
                     find_from = "L"
                     }

                     // Refresh expiration date
                     now.setDate(now.getDate()+7);

                     var params = [find,find_from,now.getTime(),localResp.title];
                     Zotero.RetracterZotero.DB.queryAsync("UPDATE retracter_cache SET retracted_status=?,derived_from=?,expiration_date=? WHERE title=?",params)
                     var params = [find,localResp.key];
                     Zotero.RetracterZotero.DB.queryAsync("UPDATE retracted set retracted=? WHERE title=?",params)
                     }
                     }
                     });
                     }
                     }else{
                     // if not found
                     // check local data
                     var find = "U";
                     var find_from = "U";

                     if(local_data.indexOf(localResp["title"])>=0){
                     find = "R";
                     find_from = "L"
                     }

                     // set expiration date for cache
                     var d = new Date();
                     // add 7 days for expiration time
                     d.setDate(d.getDate()+7);

                     var params = [localResp.title,localResp.DOI,find,find_from,d.getTime()];
                     Zotero.RetracterZotero.DB.queryAsync("INSERT INTO retracter_cache VALUES (?,?,?,?,?)",params)
                     var params = [localResp.key,find];
                     Zotero.RetracterZotero.DB.queryAsync("INSERT INTO retracted VALUES (?,?)",params)
                     //CREATE TABLE retracter_cache (title text,doi text,retracted_status text,derived_from text,expiration_date real)
                     }
                     });

                     */

                    /*
                     fetch("http://retractiondatabase.org/RetractionSearch.aspx?ttl="+localResp.title+"&AspxAutoDetectCookieSupport=1", {
                     "credentials": "include",
                     "headers": {
                     "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/
                    /*
                     *;q=0.8",
                     "accept-language": "en-US,en;q=0.9",
                     "cache-control": "max-age=0",
                     "content-type": "application/x-www-form-urlencoded",
                     "upgrade-insecure-requests": "1"
                     },
                     "referrer": "http://retractiondatabase.org/RetractionSearch.aspx?ttl="+localResp.title+"&AspxAutoDetectCookieSupport=1",
                     "referrerPolicy": "no-referrer-when-downgrade",
                     "body": "__LASTFOCUS=&__EVENTTARGET=btnSearch&__EVENTARGUMENT=&__VIEWSTATE=1zDnBebp1%2BWs19KahiFQlyeAO5%2BSjjEhYGSjz66r2rnFXA980CQQ0FeraLb56kH4f%2BkgfrzUaXJXMUCeaswkPQddWoqIeI9QUCaSjlP7usmknzkD7SAQR1FYNjVcKgsPWxsjjI2gkox2oyPivHoi0vkxDgTo1I2IiqlyD4S1IWSo2QWcuvnp4zorJJ6Qpm1dCATcf02gmo1bkWkxLzuM73tN4oLePVGk0VlAj0KXazhI3b7Ch4qWc9V7cfyOWPFDAj6IwFvioMQYGtPdnNf%2BR%2FR%2FZrvRZAc1PSrfwRkjcpBAVKzx5I80%2FTCOsw0uhw%2F1NkJw906ZQ5FsSk%2BYEcwzderZPFpEbpOn1SPcejtKtMvuax4riahhsbuGAqeQibW0qqjP2YIdN34Gqqkx%2FSsGOXckcmhQXmG6kcnlNtFnUVba2NJRL%2BaTBkwgk0O7Mq6JFaiCYVzmI5xc%2FwOtM6y4I6ELYPfCNyUmvUeo6x3xRRSZletitmueYvZBUbdSqmLaDQfXl9KGHlK7K%2BDPo%2F2VfXS75iUdN9WLqMwGMgJt%2FgTzJYOoreKzRHTATgantMtJrV1uhLKfQvFvJ51hoPcjsRK1LbdXA2CcpMY7zm2tU%2FpRJmAe2iqXAy%2BSxb0bV%2BOVK3vbQnUZ2TVuZpX0CzdTY8A6bvRmRky55EdC9QyuVj70vSWDkASZZGutQPMn%2F0BN0oVqoB%2BBif6tten6Tr6zpaGsZCGkfuzeOtZ7Wh%2BPZfvVCHI1zPanQo2WJBN4LGA0QEpQApyeaeofTaqU%2B0eEMEPL1TsNVHJjH7%2FlqkNKvmtRBn10mFeM6e5ID52L6wxxIBbHLZ9K%2BoZkGx54EtqBSpJ17J06YlUw33zyfAhJOa98wwgPY7sKFNsFmfxu3EK0Me6j2SsXcKV3%2FbDBvqtQ%2F75AnNsU6c29JkAuTCHXv1PLrNvwtqXHvolVcXgNapCjiHTlCb25%2BAI7w23CUDocBpmMGh2EnwE%2BvYXKEr6GkAHvkQQn7pnZ9f1xlbFVO419DWhOscSoCWOSkqMLOv3%2F4Pz4hWOu98F6ZO3vnDYmSd2wUojWainoj%2BRxOPPSU2%2Flp1dLb2sPtx1yuHVndF8UZM%2FtPN9FkPFGHM7kp0MzvWmPtBcyForYxItYT0lLX7V9MUa12HrGDpoXBPUCfUWsxR%2FzgyEneqADP4pkGo85kmbMmNaPswEzkv9V%2F8mg9bQzutN8kp1J0Vnn2%2FsrL%2BpiT7bo8%2BPGZeJUG0dCFKCy0v%2BtTg7R%2FC1QvjC4ksFeb%2BotYqojZA8DZPNGar0dcGUe1dltTX5EHZDDZMwRySGG2YfqUzYyFXAs0nM63dLDN5bWO1%2BSne86IKBIXImcdxMUIKJYKck13dJjfleuNmdIXrF0MgYorB%2Fzot6zgddEWtNO%2FB52oEtgvcIE6yf5bktUAGkQZBkOM5e8YGyFZQ%2BjyEr9obOYPHmiL4VnvMu9qsO%2BlhgpGoF30JuzrU358p%2B2vO39t1UUQMrX7wUXO8qPrDaLRVzjtPJn%2BJc6JZo7cslHhg1qstPLj8DE9RL0AEMJCqumY9BI3W1BNN791oHXFX77%2FsWl4RnuxAtzuD%2FVIc43dZoLAOavqeGr7mF1tRy5%2BAAizinhxmAhvswXaN%2BELnHcJJJ1Ymbcclu%2Bw16UYMJN8DRP5a%2BqVQmXHxB4lYBHHrOwjFU3pPHDTZXfbOOfmsQ4DuUAxlO2UxJAkv07%2FSPzyw3ZPr%2Bdxiis8V4TeheRgyoH6X81xcJ7r9aKWVcSZiV5sShdVVFQc1CGBCnMKikpyO%2BUNC%2Fd9yb4MYNmVlXbxxCiHoWm5V%2FrZ%2BZvSW1UcCjYZT1LPWf5pQ%2B5zxjPvvCPvsBMY%2BmeadDx0f3t3gH9A%2FMCtDnhXsDEzkirihsjykh1GxijzGph7tX5SLpfg29bGjJi9%2BdkAnrw3DtRlVbkKthlFZN33ggCJdA2HWt73BP3MPsbAuvyX5ypgi8nByphNDeGmA%3D%3D&__VIEWSTATEGENERATOR=F1918523&__VIEWSTATEENCRYPTED=&__EVENTVALIDATION=USi0tYcPks5ntjXZ0EvJLRfUlO98LEQ2WllhusbnvYkiTCQfMjYhXzasuObtIMEphkjC6cCQ0CLiFTRE6F9aHfPDXGOtm41eJj7yZJHylytisfzuD%2Fcu1cbAnpt6xW%2BxBYjsEnNSf9Fd7SdaNJ3Sae56hEjPdGF21adibXwzQ495Kmrl7BmddbAsTj6EAyMje46IJLsg%2BjObNnSSrvjSZFwWm%2BH54KtCFdXM2iPaM7GN3jITn0h5j7jaPSDuKWJGqvJZHWceTvbte13WPeZtd%2FsLxV2cqDmQu2aLHItkdDP%2BC6MLPdhj1MQ84E%2FkKjn7Eq1hx6Zr5RdXGtcWh495yj1Xm6VSxsVrGxIuPc8g8FeWVSNk7gwLQ%2FpngiJo2xVCJ5lkoclfnDAlo4wemxDEwbaIe0uUBVJnNtHpj9AjEJZ9ppWQmhFF3v565jM2cq2o1MtiI0D8TTg7hqXdFnr%2BcKa1LwPzCknOfiwku594NqWyEETvHPkybadjjsxyIwNpxhzR8R%2FqpYLgyIP8kAxr7p8ZwXhRv1UHUpTlCJaQ9Wv6VZmyH%2F1K4J8JMOJd4NwYyrCinhJUr1mm9oRcmy8ycYp8vn6VwuhBAW78Zs84h159x%2FyA07E%2Fflwkah%2BcTju5OZyZnnyKcVD%2FUAvSkikb4dy1qAiG9xtgXdP8Icp5P5UNlh2jAp%2BYGduvQRUxABYbBArC2zKmFfJnV4zdLEk4oh5QrxboecrRqUhJWsVCLbD2SZ%2F%2BP0XdKihuM8ZDDUayOyhPGteRPGLfSeQdFYzj2rV0Y%2BAAhs%2BopN7viCJ176DxgzX068cLP21BO3lJgJjbjzVbUjft38Mifsa4WSSFqNxCACWhHy5Ji21t0BsJQvcl4lkfi4aFRQWCtr88aJ72AYoFX2SoVSNanQsa%2BBkvRbTQz0ZFrXXGAVHZinT9gGsv7%2BMYzIEtmBe4k1IyQgA3eTFsSPpnn2xsqNJjZYiRkbvRhgJqjBgx4sqpm42d6eO7xubedH3Ry%2BLurkf26h45X3eeQ1eutngSJ2l4zWvLvzZ%2BFWPl%2FZKXCO%2FwEjdKaEXjxnXGxpbwrInfbTDraP5r28lh5QAhVZRaD%2FFm1IjL6KiPWVEIDpinR3wKsMVWt61zyHNVB6aTnJIMzMPwv0guH1wyvPWtnjbk6GEZQH8%2F6EIZAllKy1CZVQAECGHEGCKVwATNQ1u8ht5HcG8EmvgPpC8EtNPXNynKFFsFLhtV5p3CCAoAjBucqRD606Thx7mzGTlf%2BPNk89SeNVIAZzEBPw0OjlcNfVGeE2TmsI77O6EoYXw4oECvWGrYZr65GaLgXg3j%2BBh%2BtN2ohOddyriyNLyi9GwWaKxvU0LhulEsrm469Oh8pFMBw2qqjc2%2F9QRnmzLySyY6Emuz80UCEtNjvyO6tASNmPfpnobypaKkVY5kNNKTPQFBVCsVXZ%2FoyenokzZi&txtEmail=&txtPSWD=&txtSrchAuthor=&txtSrchCountry=&txtSrchTitle=" + localResp.title + "&txtSrchReason=&txtSrchSubject=&txtSrchType=&txtSrchJournal=&txtSrchPublisher=&txtSrchInstitution=&txtSrchNotes=&txtSrchAdminNotes=&txtSrchURL=&txtOriginalDateFrom=&txtOriginalDateTo=&txtOriginalPubMedID=&txtOriginalDOI=&txtFromDate=&txtToDate=&txtPubMedID=&txtDOI=&drpNature=&drpSrchPaywalled=&drpUser=&txtCreateFromDate=&txtCreateToDate=&hidClearSearch=&hidSqlParmNames=&hidEmptySqlParmNames=",
                     "method": "POST",
                     "mode": "cors"
                     }).then(function (resp) {
                     resp.text().then(function (val) {
                     Zotero.debug(val);
                     if (val.indexOf("No Retractions") >= 0) {
                     Zotero.debug("retracter " + localResp.title + ": found");
                     } else {
                     Zotero.debug("retracter " + localResp.title + ": not found");
                     }
                     });
                     });
                     */
                } catch (err) {
                    Zotero.debug("Retracters Error: " + err);
                }
            }
        }))}}};



// Initialize the utility
window.addEventListener('load', function (e) {
    Zotero.RetracterZotero.init();
}, false);