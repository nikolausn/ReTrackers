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
    try {
        // init database
        Zotero.DataDirectory._dir = Zotero.DataDirectory.defaultDir;
        this.DB = new Zotero.DBConnection('retracters');
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
    var notifierID = Zotero.Notifier.registerObserver(this.notifierCallback, ['sync']);
    //var notifierItemChange = Zotero.Notifier.registerObserver(this.notifierItemCallback, ['collection', 'search', 'item', 'collection-item', 'item-tag', 'tag',
    //    'group', 'relation', 'feed', 'feedItem']);

    Zotero.debug('Retracters Plugin, grabbing retracted paper' + notifierID);
    //Zotero.debug('Retracters Plugin, grabbing retracted paper' + notifierItemChange);

    Zotero.debug('Retracters Local Data: '+local_data[0]);

    // Unregister callback when the window closes (important to avoid a memory leak)
    window.addEventListener('unload', function (e) {
        Zotero.RetracterZotero.DB.closeDatabase();
        Zotero.Notifier.unregisterObserver(notifierID);
        //Zotero.Notifier.unregisterObserver(notifierItemChange);
    }, false);

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
            var ids = selectedItems.map(item => item.id
            )
            ;
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
        }.bind(this)).finally(function () {
            try{
                var item_box = document.getElementById('zotero-editpane-item-box');
                Zotero.debug("Retracter Document: " + JSON.stringify(item_box.item));
                Zotero.debug("Retracter Item Type Id: " + item_box.item.itemTypeID);

                Zotero.RetracterZotero.DB.queryAsync("SELECT * FROM retracted WHERE item_id=?",item_box.item.key).then(function(item_check) {
                    if(item_check.length>0){
                        // If item is retracted, set label on item info pane
                        if(item_check[0]["retracted"]==="R"){
                            var titleFieldID = Zotero.ItemFields.getFieldIDFromTypeAndBase(item_box.item.itemTypeID, 'title');
                            var field = item_box._dynamicFields.getElementsByAttribute('fieldname', Zotero.ItemFields.getName(titleFieldID)).item(0);
                            //var field = item_box.getElementsByAttribute('fieldname', "itemType").item(0);
                            //Zotero.debug("field: " + JSON.stringify(field));
                            let label = document.createElement("label");
                            label.setAttribute('fieldname', "Retracted");
                            label.setAttribute('value', "Retracted")
                            label.setAttribute('style', "color:red")
                            let valueElement = document.createElement("label");
                            valueElement.setAttribute('fieldname', "RetractedVal");
                            valueElement.setAttribute('value', "This Paper is Retracted")
                            valueElement.setAttribute('style', "color:red")
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
                });
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
                Zotero.debug("Retracter title: " + localResp.title);
                Zotero.debug("fetch retraction data");

                if(localResp.hasOwnProperty("DOI")&&localResp.hasOwnProperty("title")) {
                    try {
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




                        if(!find){

                            /* Check Pubmed */
                            /*
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


                            find = true;
                            find_from = "L"
                            */
                        }


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
                        Zotero.debug("Retracters Error: "+err);
                    }
                }


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

            //Zotero.debug("Retracter libraries: "+JSON.stringify(zotlib));
            //for (item of zotlib) {
            //    Zotero.debug("Retracter item: "+JSON.stringify(item))
            //}

            }));
            };

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