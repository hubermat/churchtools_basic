calendar=null;
currentEvent=null;
allEvents=null;
allPersons=null;
allData=new Object();
// For loading ChurchResource-Bookings
allBookings=null;
viewName="calView";
filterName="";
previousBookings=null;
filterCategoryIds=null;
var saveSettingTimer=null;
var filter=new Object();
var embedded=false;
var minical=false;
var max_entries=50;
var printview=false;


/*
 * Collect database conform event vom source
 */
function getEventFromEventSource(event) {
  if ((event.source==null) || (event.source.container.data==null) 
       || (event.source.category_id==0)
             || (event.source.container.data[event.source.category_id]==null))
    return null;
  else
    return event.source.container.data[event.source.category_id].events[event.id];
}

function _eventDrop(event, delta, revertFunc, jsEvent, ui, view ) {
  if (debug) console.log("_eventDrop", event, delta, revertFunc, jsEvent, ui, view);
  
  var myevent=getEventFromEventSource(event);
  if (myevent==null) {
    alert("Fehler oder keine Rechte!");
    revertFunc();
    return null;
  }
  
  if (myevent.event_id!=null && !confirm("Achtung, der Eintrag ist mit "+masterData.churchservice_name+" verbunden. Das Event und die evtl. angefragten Dienste werden hiermit auch verschoben!")) {
    revertFunc();
    return null;
  }
  if (!user_access("administer bookings") && myevent.booking_id!=null && !confirm("Achtung, es sind Ressourcen angefragt, die bei einer Verschiebung eventuell wieder bestätigt werden müssen. Wirklich Eintrag verschieben?")) {
    revertFunc();
    return null;
  }
  
  var start=moment(myevent.startdate);
  start.add(delta);
  myevent.startdate=start.format(DATETIMEFORMAT_EN).toDateEn(true);
  if (event.end==null) {
    myevent.enddate=new Date(myevent.startdate);
    myevent.enddate.setMinutes(myevent.startdate.getMinutes()+120);
  }
  else {
    var end=moment(myevent.enddate);
    end.add(delta);
    myevent.enddate=end.format(DATETIMEFORMAT_EN).toDateEn(true); 
  }

  if (event.source && event.source.container)
    event.source.container.refreshView(event.source.category_id, false);
  
  
  var o = new Object();
  o.func="updateEvent";
  o.startdate=myevent.startdate;
  o.enddate=myevent.enddate;
  o.id=event.id;
  o.bookings=myevent.bookings;
  o.bezeichnung=myevent.bezeichnung;
  o.category_id=myevent.category_id;
  // All Day event
  if (!event.start.hasTime()) {
    o.startdate=o.startdate.toStringDe(false).toDateDe(false);
    // Wenn er nur einen Tag geht, dann ist wohl manchmal enddate==null
    if (o.enddate==null) {
      o.enddate=new Date(o.startdate);
    }
    else
      o.enddate=o.enddate.toStringDe(false).toDateDe(false);
  }
  else if (o.enddate==null) {
    o.enddate=new Date(o.startdate);
    o.enddate.setMinutes(o.startdate.getMinutes()+90);
    event.end=o.enddate;
  }

  churchInterface.jsendWrite(o, function(ok, data) {
    if (!ok) {
      alert(data);
      revertFunc();
    }
    // Wenn es Wiederholungstermine gibt, kann es bei Verschiebung notwendig sein neu zu rendern wegen Ausnahmetagen!
    if ((myevent.repeat_id>0 && delta.asDays()!=0) || (o.bookings!=null)) {
      calCCType.refreshView(myevent.category_id, o.bookings!=null);
    }
    if (o.bookings!=null) {
      // Refresh completly, because perhaps bookings status changed
      calResourceType.refreshView(null, true);
    }
  }, true, false);
}

function _eventResize(event, delta, revertFunc, jsEvent, ui, view) {
  if (debug) console.log("_eventResize", event, delta);

  var myevent=getEventFromEventSource(event);
  if ((myevent==null) || (masterData.auth["edit category"]==null) || (masterData.auth["edit category"][event.source.category_id]==null)) {
    alert("Fehler oder keine Rechte!");
    revertFunc();
    return null;
  }

  if (myevent!=null) {
    
    if (!user_access("administer bookings") && myevent.booking_id!=null && !confirm("Achtung, es sind Ressourcen angefragt, die bei einer Verschiebung eventuell wieder bestätigt werden müssen. Wirklich Eintrag verschieben?")) {
      revertFunc();
      return null;
    }
    
    var m=moment(myevent.enddate);
    m.add(delta);
    myevent.enddate=m.format(DATETIMEFORMAT_EN).toDateEn(true);
    if (event.source && event.source.container)
      event.source.container.refreshView(event.source.category_id, false);
    churchInterface.jsendWrite({func:"updateEvent", id:event.id, startdate:myevent.startdate,
        enddate:myevent.enddate, bezeichnung:myevent.bezeichnung, category_id:myevent.category_id,
         bookings:myevent.bookings}, function(ok, data) {
        if (!ok) {
          alert(data);
          revertFunc();
        }
        else {
          if (myevent.bookings!=null) {
            // Refresh completly, because perhaps bookings status changed
            calResourceType.refreshView(null, true);
          }
        }
    }, true, false);
  }
}
  
function _select(start, end, jsEvent, view) {
  if (debug) console.log("_select", start, end, jsEvent, view);

  var event = new Object();
  event.startdate=start.format(DATETIMEFORMAT_EN).toDateEn(true);
  event.enddate=end.format(DATETIMEFORMAT_EN).toDateEn(true);
  // fullCalendar works with exclusive dates, CT not!
  if (!start.hasTime()) event.enddate.addDays(-1);
  editEvent(event, view.name=="month");
  calendar.fullCalendar('unselect');
}

function exceptionExists(exceptions, except_date_start) {
  if (exceptions==null) return false;
  var res=false;
  each(exceptions, function(k,a) {
    var s, e;
    if (a.except_date_start instanceof(Date))
      s=a.except_date_start;
    else
      s=a.except_date_start.toDateEn(true);

    if (except_date_start instanceof(Date))
      e=except_date_start;
    else
      e=except_date_start.toDateEn(true);

    if (s.getTime()==e.getTime()) {
      res=true;
      return false;
    }
  });
  return res;
}

function _renderViewChurchResource(elem) {
  // Baue erst ein schönes Select zusammen
  var arr=new Array();
  var sortkey=0;
  each(churchcore_sortMasterData(masterData.resourceTypes, "sortkey"), function(k,a) {
    arr.push({id:"", bezeichnung:'-- '+a.bezeichnung+' --'});
    each(churchcore_sortMasterData(masterData.resources, "sortkey"), function(i,b) {
      if (b.resourcetype_id==a.id) {
        arr.push({id:b.id, bezeichnung:b.bezeichnung});
      }
    });
  });
  var minutes=new Array();
  minutes.push({id:0, bezeichnung:'-'});
  minutes.push({id:15, bezeichnung:'15 '+_("minutes")});
  minutes.push({id:30, bezeichnung:'30 '+_("minutes")});
  minutes.push({id:45, bezeichnung:'45 '+_("minutes")});
  minutes.push({id:60, bezeichnung:'1 '+_("hour")});
  minutes.push({id:90, bezeichnung:'1,5 '+_("hours")});
  minutes.push({id:120, bezeichnung:'2 '+_("hours")});
  minutes.push({id:150, bezeichnung:'2,5 '+_("hours")});
  minutes.push({id:180, bezeichnung:'3 '+_("hours")});
  minutes.push({id:240, bezeichnung:'4 '+_("hours")});
  minutes.push({id:300, bezeichnung:'5 '+_("hours")});
  minutes.push({id:360, bezeichnung:'6 '+_("hours")});
  minutes.push({id:60*8, bezeichnung:'8 '+_("hours")});
  minutes.push({id:60*12, bezeichnung:'12 '+_("hours")});
  minutes.push({id:60*24, bezeichnung:'1 '+_("day")});
  
  var form = new CC_Form();
  if (currentEvent.minpre==null) {
    currentEvent.minpre=0; currentEvent.minpost=0;
  }
  form.addSelect({label:"Im Vorfeld buchen", cssid:"min_pre_new", sort:false, selected:currentEvent.minpre, data:minutes});
  form.addSelect({label:"Nachher buchen", cssid:"min_post_new", sort:false, selected:currentEvent.minpost, data:minutes});
  form.addSelect({cssid:"ressource_new",  htmlclass:"resource", freeoption:true,
          label:"Ressource ausw&auml;hlen", data:arr, sort:false, func:function(a) {
            return a.id=="" || currentEvent.bookings==null || currentEvent.bookings[a.id]==null;
          }});
  if (currentEvent.bookings==null && previousBookings!=null && previousBookings!=currentEvent.bookings)
    form.addButton({controlgroup:true, label:"Vorherige Buchungen hinzufügen", htmlclass:"use-previous-bookings"});

  if (currentEvent.bookings!=null) {
    if (allBookings==null) {
      if (user_access("view churchresource")) {
        allBookings=new Object();
        $.getCTScript("system/churchresource/cr_loadandmap.js", function() {
          $.getCTScript("system/churchresource/cr_weekview.js", function() {
            churchInterface.setModulename("churchresource");
            cr_loadBookings(function() {
              weekView.buildDates(allBookings);
              _renderViewChurchResource(elem);
            });
            churchInterface.setModulename("churchcal");
          });
        });
      }
    }
    
    form.addHtml('<legend>Vorhandene Buchungen</legend>');
    form.addHtml('<div class="w_ell"><table class="table table-condensed"><tr><th>Ressource<th>Vorher<th>Nachher<th>Status<th>');
    each(currentEvent.bookings, function(k,a) {
      form.addHtml('<tr><td>');
      form.addHtml(masterData.resources[a.resource_id].bezeichnung);
      form.addHtml('<td>');
      form.addSelect({type:"small", cssid:"min-pre-"+a.resource_id, controlgroup:false, sort:false, selected:a.minpre, data:minutes});
      form.addHtml('<td>');
      form.addSelect({type:"small", cssid:"min-post-"+a.resource_id, controlgroup:false, sort:false, selected:a.minpost, data:minutes});
      form.addHtml('<td>');
      form.addSelect({type:"medium", data:masterData.bookingStatus, cssid:"status-"+a.resource_id, controlgroup:false, selected:a.status_id,
          func:function(s) {
            return s.id==1
                   || (s.id==2 && masterData.resources[a.resource_id].autoaccept_yn==1)
                   || masterData.auth["administer bookings"]
                   || s.id==a.status_id;
          }
      });
      form.addHtml('<td>');
      if (a.status_id!=99)
        form.addImage({src:"trashbox.png", htmlclass:"delete-booking", link:true, width:20, data:[{name:"id", value:a.resource_id}]});
      if (typeof weekView!='undefined') {
        if (allBookings[a.id]!=null && allBookings[a.id].exceptions!=null) {
          var arr=new Array();
          each(churchcore_sortData(allBookings[a.id].exceptions, "except_date_start"), function(i,b) {
            if (!exceptionExists(currentEvent.exceptions, b.except_date_start))
              arr.push(b.except_date_start.toDateEn(false).toStringDe(false));
          });
          if (arr.length>0) {
            form.addHtml('<tr><td><td colspan="4">Ausnahmen: &nbsp;');
            each(arr, function(i,b) {
              form.addHtml('<span class="label label-important">'+b+'</span> &nbsp;');
            });
          }
        }
        var c=$.extend({}, currentEvent);
        c.startdate=new Date();
        c.enddate=new Date();
        c.startdate.setTime(currentEvent.startdate.getTime() - (a.minpre * 60 * 1000));
        c.enddate.setTime(currentEvent.enddate.getTime() + (a.minpost * 60 * 1000));
        c.id=a.id;
        var conflicts=weekView.calcConflicts(c, a.resource_id);
        if (conflicts!="") form.addHtml('<tr><td colspan="5"><div class="alert alert-error">Konflikte: '+conflicts+"</div>");
      }
      else if (user_access("view churchresource")) {
        form.addHtml('<tr><td colspan="5">');
        form.addImage({src:"loading.gif"});
      }

    });
    form.addHtml('</table></div>');
  }
  
  elem.find("#cal_content").html(form.render(null, "horizontal"));
  
  elem.find("select.resource").change(function() {
    if (elem.find("select.resource").val()>0) {
      if (currentEvent.bookings==null) currentEvent.bookings=new Object();
      currentEvent.minpre=elem.find("#min_pre_new").val();
      currentEvent.minpost=elem.find("#min_post_new").val();
      var resource_id=elem.find("select.resource").val();
      var status_id=(masterData.resources[resource_id].autoaccept_yn==1?2:1);
      currentEvent.bookings[elem.find("select.resource").val()]={resource_id:resource_id,
                minpre:currentEvent.minpre, minpost:currentEvent.minpost,
                status_id:status_id, fresh:true};
      _renderEditEventContent(elem, currentEvent);
    }
  });
  elem.find("select").change(function() {
    if ($(this).attr("id").indexOf("min-pre-")==0) {
      currentEvent.bookings[$(this).attr("id").substr(8,99)].minpre=$(this).val();
      _renderEditEventContent(elem, currentEvent);
    }
    else if ($(this).attr("id").indexOf("min-post-")==0) {
      currentEvent.bookings[$(this).attr("id").substr(9,99)].minpost=$(this).val();
      _renderEditEventContent(elem, currentEvent);
    }
    else if ($(this).attr("id").indexOf("status-")==0) {
      currentEvent.bookings[$(this).attr("id").substr(7,99)].status_id=$(this).val();
      _renderEditEventContent(elem, currentEvent);
    }
  });
  elem.find("input.use-previous-bookings").click(function() {
    currentEvent.bookings=previousBookings;
    _renderEditEventContent(elem, currentEvent);
  });
  elem.find("a.delete-booking").click(function() {
    // Is booking created but not saved (fresh), then I can delete it.
    if (currentEvent.bookings[$(this).attr("data-id")].fresh) {
      delete currentEvent.bookings[$(this).attr("data-id")];
    }
    else {
      currentEvent.bookings[$(this).attr("data-id")].status_id=99;
    }
    _renderEditEventContent(elem, currentEvent);
    return false;
  });
}
 
function currentEvent_addException(date) {
  if (currentEvent.exceptions==null) currentEvent.exceptions=new Object();
  if (currentEvent.exceptionids==null) currentEvent.exceptionids=0;
  currentEvent.exceptionids=currentEvent.exceptionids-1;
  currentEvent.exceptions[currentEvent.exceptionids]
        ={id:currentEvent.exceptionids, except_date_start:date.toStringEn(), except_date_end:date.toStringEn()};
}


function _renderInternVisible(elem, currentEvent) {
  var txt="";
  if ((masterData.category[currentEvent.category_id]!=null) && 
     (masterData.category[currentEvent.category_id].oeffentlich_yn==1)) {
    txt=txt+form_renderCheckbox({
      checked:(currentEvent.intern_yn!=null && currentEvent.intern_yn==1?true:false),
      label:" "+_("only.intern.visible"),
      controlgroup:true,
      controlgroup_class:"",
      cssid:"inputIntern"
    });
  }
  $("#internVisible").html(txt);
}

function _renderEditEventContent(elem, currentEvent) {
  var rows = new Array();
  if (currentEvent.view=="view-main") {
  
    rows.push('<form class="form-horizontal">');
  
    rows.push(form_renderInput({
      value:currentEvent.bezeichnung,
      cssid:"inputBezeichnung",
      label:_("caption")
    }));
  
    rows.push(form_renderInput({
      value:currentEvent.ort,
      cssid:"inputOrt",
      label:_("note"),
      placeholder:""
    }));
    rows.push('<div id="internVisible"></div>');
    rows.push('<div id="dates"></div>');
    rows.push('<div id="wiederholungen"></div>');
    
    var e_summe=new Array();
    var e=new Array();
    if (currentEvent.events==null) {
      e.push({id:-1, bezeichnung:"-- "+_("personal.calendar")+" --"});
      each(churchcore_sortMasterData(masterData.category), function(k,a) {
        if ((a.privat_yn==1) && (categoryEditable(a.id))) e.push(a);
      });
      if (e.length>1) e_summe=e_summe.concat(e);
    }

    var e=new Array();
    e.push({id:-1, bezeichnung:"-- "+_("group.calendar")+" --"});
    each(churchcore_sortMasterData(masterData.category), function(k,a) {
      if ((a.oeffentlich_yn==0) && (a.privat_yn==0) && (categoryEditable(a.id))) e.push(a);
    });
    if (e.length>1) e_summe=e_summe.concat(e);

    var e=new Array();
    e.push({id:-1, bezeichnung:"-- "+masterData.maincal_name+" --"});
    each(churchcore_sortMasterData(masterData.category), function(k,a) {
      if ((a.oeffentlich_yn==1) && (categoryEditable(a.id))) e.push(a);
    });
    if (e.length>1) e_summe=e_summe.concat(e);
    
    
    rows.push(form_renderSelect({
      //data:masterData.category,
      data:e_summe,
      sort:false,
      cssid:"inputCategory",
      selected:currentEvent.category_id,
      label:_("calendar")
    }));
    rows.push(form_renderTextarea({
      data:currentEvent.notizen,
      label:_("more.information"),
      cssid:"inputNote",
      rows:2,
      cols:100
    }));
    rows.push(form_renderInput({
      value:currentEvent.link,
      label:"Link",
      cssid:"inputLink"
    }));
  
    rows.push('</form>');
        
    if (currentEvent.id!=null) {
      rows.push('<p align="right"><small>');
      rows.push(' #'+currentEvent.id);
      if (currentEvent.modified_name!=null) rows.push(' - Erstellt von '+currentEvent.modified_name);
      if (currentEvent.modified_date!=null) rows.push(" am "+currentEvent.modified_date.toDateEn(true).toStringDe(true)+"&nbsp;");
      rows.push("</small>");
    }

    elem.find("#cal_content").html(rows.join(""));

    _renderInternVisible(elem, currentEvent);
    form_renderDates({elem:$("#dates"), data:currentEvent,
      deleteException:function(exc) {
        delete currentEvent.exceptions[exc.id];
      },
      addException:function(options, date) {
        currentEvent_addException(date.toDateDe());
        return currentEvent;
      },
      deleteAddition:function(add) {
        delete currentEvent.additions[add.id];
      },
      addAddition:function(options, date, with_repeat_yn) {
        if (currentEvent.additions==null) currentEvent.additions=new Object();
        if (currentEvent.exceptionids==null) currentEvent.exceptionids=0;
        currentEvent.exceptionids=currentEvent.exceptionids-1;
        currentEvent.additions[currentEvent.exceptionids]
              ={id:currentEvent.exceptionids, add_date:date.toDateDe().toStringEn(), with_repeat_yn:with_repeat_yn};
        return currentEvent;
      }
    });
    
    $("#inputBezeichnung").focus();
    
    elem.find("#inputCategory").change(function() {
      churchInterface.jsendWrite({func:"saveSetting", sub:"category_id", val:$(this).val()});
      masterData.settings.category_id=$(this).val();
      currentEvent.category_id=$(this).val();
      _renderInternVisible(elem, currentEvent);
      _renderEditEventNavi(elem, currentEvent);
    });
  }
  else if (currentEvent.view=="view-invite") {
    rows.push('<div id="meeting-request">'+form_renderImage({src:"loading.gif"})+'</div>');
    elem.find("#cal_content").html(rows.join(""));
    churchInterface.jsendRead({func:"getAllowedPeopleForCalender", category_id:currentEvent.category_id}, function(ok, data) {
      var form = new CC_Form();
      var invitable=false;
      if (data.length==0)
        form.addHtml('<p>Dem Kalender sind keine Personen oder Gruppen zugewiesen.');
      else {
        var dt = new Date();
        if (currentEvent.startdate<dt) {
          form.addHtml('<div class="alert alert-error">Besprechungsanfrage liegt in der Vergangenheit. Es finden so keine Email-Anfragen statt.</div>');      
        }        

        form.addHtml('<div class="person-selector"></div>');
        form.addHtml('<div style="height:360px;overflow-y:auto">');
        form.addHtml('<table class="table table-condensed">');
        function _addPerson(p) {
          var mr=null;
          if (currentEvent.meetingRequest!=null)
            mr=currentEvent.meetingRequest[p.id];
          form.addHtml('<tr data-id="'+p.id+'"><td>');
          if (p.email!="" && (mr==null || mr.invite))
            form.addCheckbox({htmlclass:"cb-person", checked:(mr!=null&&mr.invite), controlgroup:false,
                data:[{name:"id", value:p.id}]});
          form.addHtml('<td>'+form_renderPersonImage(p.imageurl, 40));
          form.addHtml('<td>'+p.vorname+" "+p.name);
          form.addHtml('<td><span class="status">');
          if (p.email=="")
            form.addHtml('<i>Keine E-Mail-Adresse!');
          else {
            if (mr!=null) {
              if (mr.invite)
                form.addHtml('wird eingeladen');
              else if (mr.response_date==null)
                form.addImage({src:"question.png",width:24, label:"Noch keine Antwort!"});
              else if (mr.zugesagt_yn==null)
                form.addImage({src:"check-64_sw.png",width:24, label:"Vorbehaltlich zugesagt"});
              else if (mr.zugesagt_yn==1)
                form.addImage({src:"check-64.png",width:24, label:"Zugesagt"});
              else if (mr.zugesagt_yn==0)
                form.addImage({src:"delete_2.png",width:24, label:"Abgesagt"});
            }
            else {
              form.addHtml('nicht eingeladen');
              invitable=true;
            }
          }
          form.addHtml('</span>');
        }
        each(data, function(k,a) {
          if (a.type=="gruppe") {
            form.addHtml('<tr><td colspan=4><h4>'+a.bezeichnung+'</h4>');
            each(a.data, function(i,p) {
              _addPerson(p);
            });
          }
        });
        form.addHtml('<tr><td colspan=4><h4>Personen</h4>');
        each(data, function(k,a) {
          if (a.type=="person") {
            _addPerson(a.data);
          }
        });
        form.addHtml('</table></div>');
      }

      elem.find("#meeting-request").html(form.render());
      if (invitable) {
        form = new CC_Form();
        form.addHtml('<p><span class="pull-right">');
        form.addButton({label:"Alle auswählen", htmlclass:"select-all"});
        form.addHtml("&nbsp; ")
        form.addButton({label:"Alle abwählen", htmlclass:"deselect-all"});
        form.addHtml('</span><i>Für eine Anfrage bitte Personen auswählen</i><br>');
        if (currentEvent.repeat_id!=0)
          form.addHtml('<small>Bei Wiederholungsterminen wird nur der erste Termin angefragt!</small>');
        form.addHtml('&nbsp;</p>');
        $('div.person-selector').html(form.render());
      }
      myelem=elem;
      elem.find("input.select-all").click(function() {
        elem.find("input.checkbox").each(function() {
          $(this).attr("checked","checked");
          $(this).trigger("change");
        });
      });
      elem.find("input.deselect-all").click(function() {
        elem.find("input.checkbox").each(function() {
          $(this).removeAttr("checked");
          $(this).trigger("change");
        });
      });
      elem.find("input.cb-person").change(function() {
        var id=$(this).attr("data-id");
        var checked=$(this).attr("checked")=="checked";
        if (checked) {
          elem.find("tr[data-id="+id+"]").find("span.status").html("wird eingeladen");
          if (currentEvent.meetingRequest==null) currentEvent.meetingRequest=new Object();
          if (currentEvent.meetingRequest[id]==null)
            currentEvent.meetingRequest[id]=new Object();
          currentEvent.meetingRequest[id].invite=true;
        }
        else {
          elem.find("tr[data-id="+id+"]").find("span.status").html("nicht eingeladen");
          if (currentEvent.meetingRequest[id]!=null)
            delete currentEvent.meetingRequest[id];
        }
      });
    });
  }
  else if (currentEvent.view=="view-churchresource") {
    _renderViewChurchResource(elem);
  }
  else if (currentEvent.view=="view-churchservice") {
    if (masterData.eventTemplate==null) {
      churchInterface.jsendRead({func:"getEventTemplates"}, function(ok, data) {
        if (!ok) alert("Fehler beim Holen der Templates: "+data);
        else {
          masterData.eventTemplate=data;
          if (masterData.eventTemplate==null) masterData.eventTemplate=new Object();
          _renderEditEventContent(elem, currentEvent);
        }
      }, null, null, "churchservice");
    }
    else {
      if (currentEvent.event_id==null) {
        var form = new CC_Form();
        form.addCaption({text:'<p>Hier kann direkt f&uuml;r <i>'+masterData.churchservice_name+'</i>'
                   +' ein Event angelegt werden. Bitte dazu eine Vorlage ausw&auml;hlen.'});
        form.addSelect({cssid:"eventTemplate", freeoption:true, selected:currentEvent.eventTemplate, label:"Event-Vorlage ausw&auml;hlen", data:masterData.eventTemplate});
        rows.push(form.render(null, "horizontal"));
      }
      else if (currentEvent.copyevent) {
        var form = new CC_Form(masterData.churchservice_name+' kopieren oder Template nutzen?');
        form.addCheckbox({label:"Alle Dienstanfragen mit kopieren",
          checked:currentEvent.copychurchservice, cssid:"copychurchservice"}  );
        form.addCaption({text:'<i>oder</i><br/><br/> '});
        form.addSelect({cssid:"eventTemplate", freeoption:true, selected:currentEvent.eventTemplate, label:"Eine Event-Vorlage w&auml;hlen", data:masterData.eventTemplate});
        rows.push(form.render(null, "horizontal"));
      }
      else {
        rows.push("Der "+masterData.churchcal_name+" Eintrag ist mit folgenden <i>"+masterData.churchservice_name+'</i> - Events verbunden:<br><br>');
        rows.push('<div class="well"><table class="table table-bordered table-condensed">');
        rows.push('<tr><th>Event-Datum<th>');
        each(churchcore_sortData(currentEvent.events, "startdate"), function(k,a) {
          rows.push('<tr><td>'+a.startdate.toDateEn(true).toStringDe(true));
          rows.push('<td><a class="btn" href="?q=churchservice&id='+a.id+'">Event aufrufen</a>');
        });
        rows.push('</table>');
        if (currentEvent.event_template_id==null || masterData.eventTemplate[currentEvent.event_template_id]==null)
          currentEvent.event_template_id=churchcore_getFirstElement(masterData.eventTemplate).id;
        rows.push('<p><small>Die Services wurden mit dem Template <i>'+
            masterData.eventTemplate[currentEvent.event_template_id].bezeichnung+'</i> erstellt</small>');
        rows.push('</div>');
      }
      elem.find("#cal_content").html(rows.join(""));
      elem.find("#copychurchservice").change(function() {
        currentEvent.copychurchservice=$(this).attr("checked")=="checked";
        if (currentEvent.copychurchservice) {
          elem.find("#eventTemplate").val("");
          currentEvent.eventTemplate=null;
        }
      });
      elem.find("#eventTemplate").change(function() {
        elem.find("#copychurchservice").removeAttr("checked");
        currentEvent.copychurchservice=null;
/*        if ((currentEvent.repeat_id!=0) && ($(this).val()!="")) {
          alert("Leider geht das nicht bei Wiederholungsterminen! Hierzu bitte die Kopier-Funktion verwenden.");
          elem.find("#eventTemplate").val("")
          return;
        }*/
        currentEvent.eventTemplate=$(this).val();
      });
    }
  }
}

function _renderEditEventNavi(elem, currentEvent) {
  var navi = new CC_Navi();
  navi.addEntry(currentEvent.view=="view-main","view-main","Kalender");
  if ((masterData.category[currentEvent.category_id].oeffentlich_yn==0)
        && (masterData.category[currentEvent.category_id].privat_yn==0))
    navi.addEntry(currentEvent.view=="view-invite","view-invite","Besprechungsanfrage");
  if ((masterData.category[currentEvent.category_id].privat_yn==0) && (masterData.auth["view churchservice"]))
    navi.addEntry(currentEvent.view=="view-churchservice","view-churchservice",masterData.churchservice_name);
  if (masterData.auth["create bookings"] || masterData.auth["administer bookings"])
    navi.addEntry(currentEvent.view=="view-churchresource","view-churchresource",masterData.churchresource_name);
  navi.renderDiv("cal_menu", churchcore_handyformat());
  
  elem.find("ul.nav a").click(function() {
    if (currentEvent.view=="view-main") getCalEditFields(currentEvent);
    currentEvent.view=$(this).attr("id");
    _renderEditEventNavi(elem, currentEvent);
    _renderEditEventContent(elem, currentEvent);
  });
}

function getCalEditFields(o) {
  form_getDatesInToObject(o);
  o.bezeichnung=$("#inputBezeichnung").val();
  o.ort=$("#inputOrt").val();
  o.intern_yn=($("#inputIntern").attr("checked")=='checked'?1:0);
  o.notizen=$("#inputNote").val();
  o.link=$("#inputLink").val();
  o.category_id=$("#inputCategory").val();
}

function eventDifferentDates(a, b) {
  if (a.startdate.getTime()!=b.startdate.getTime() ||
      a.enddate.getTime()!=b.enddate.getTime())
    return true;
  
  if (a.repeat_id!=b.repeat_id)
    return true;
  
  if (a.repeat_id>0) {
    if ((a.repeat_until==null && b.repeat_id!=null) ||
      (a.repeat_until!=null && b.repeat_id==null) ||
      (a.repeat_until!=null && b.repeat_until!=null && a.repeat_until.getTime()!=b.repeat_until.getTime()))
    return true;
  }

  if (JSON.stringify(a.exceptions)!=JSON.stringify(b.exceptions))
    return true;

  if (JSON.stringify(a.additions)!=JSON.stringify(b.additions))
    return true;
  
  return false;
}

function saveEvent(event) {
  var o=currentEvent;
  var oldCat=o.category_id;
  if (currentEvent.view=="view-main")
    getCalEditFields(o);
  
  if (currentEvent.events!=null && eventDifferentDates(event, currentEvent))  {
    if (!confirm("Achtung, da der Termin mit "+masterData.churchservice_name+" verknüpft ist, hat jede Änderung auch dort Auswirkungen. Dies kann auch angefragt Dienste betreffen!"))
      return null;
    if (currentEvent.eventTemplate==null)
      currentEvent.eventTemplate=currentEvent.event_template_id;
  }
  
  if (currentEvent.id!=null) {
    o.func="updateEvent";
    o.currentEvent_id=currentEvent.id;
  }
  else
    o.func="createEvent";
  
  previousBookings=$.extend({}, o.bookings);
  
  churchInterface.jsendWrite(o, function(ok, data) {
    if (!ok) alert("Fehler beim Anpassen des Events: "+data);
    else {
      if ((event!=null) && (event.category_id) && (event.category_id!=o.category_id))
        calCCType.needData(event.category_id, true);
      calCCType.needData(o.category_id, true);
      if (o.bookings!=null) calResourceType.refreshView();
    }
  }, false, false);
  return true;
}


function cloneEvent(event) {
  var e=jQuery.extend(true, {}, event);
  e.startdate=event.startdate;
  e.enddate=event.enddate;
  if (event.repeat_until!=null)
    e.repeat_until=new Date(event.repeat_until.getTime());
  return e;
}

/**
 * event - Event wie in der DB
 * month - Monatsansicht=true
 * currentDate - Das Datum auf das geklickt wurde, nur bei Wiederholungsterminen kann es anders sein
 */
function editEvent(event, month, currentDate, jsEvent) {
/*  if (event.repeat_id>0) {
    $("#mypop").remove();

    var parentOffset = $("#calendar").offset();
    var rows = new Array();
    var id=1;
    rows.push('<ul class="dropdown-menu" role="menu" aria-labelledby="dLabel">');
    rows.push('<li><a href="#" class="options edit-one">Einzelnen Termin öffnen</a></li>');
      rows.push('<li><a href="#" class="options edit-all">Gesamte Serie öffnen</a></li>');
    rows.push('</ul>');
    
    $('#calendar').append('<div id="mypop" style="z-index:10000;position:absolute;">'+rows.join("")+'</div>');
    $("#mypop").offset({ top: jsEvent.clientY, left: jsEvent.clientX});
    $("#mypop ul.dropdown-menu").css("display", "inline");
    shortcut.add("esc", function() {
      $("#mypop").remove();
    });  
    $("#mypop a.edit-one").click(function() {
      
    });
    $("#mypop a.edit-all").click(function() {
      
    });
    return;
  }*/
  
  
  // Clone object
  currentEvent = cloneEvent(event);
  currentEvent.view="view-main";
  if (previousBookings==null && currentEvent.bookings!=null) previousBookings=$.extend({}, currentEvent.bookings);
  
  if ((month) && (currentEvent.allDay==null) && (currentEvent.startdate.getHours()==0) && (currentEvent.startdate.getDate()==currentEvent.enddate.getDate()))
    currentEvent.startdate.setHours(10);
  if (currentEvent.enddate==null) {
    currentEvent.enddate=new Date(currentEvent.startdate);
    // Wenn es kein Ganztagstermin ist, dann setze Ende 1h rauf
    if (currentEvent.startdate.getHours()>0)
      currentEvent.enddate.setHours(currentEvent.startdate.getHours()+1);
  }
  if (currentEvent.bezeichnung==null) currentEvent.bezeichnung="";
  if (currentEvent.category_id==null) currentEvent.category_id=masterData.settings.category_id;
  if (!categoryEditable(currentEvent.category_id)) {
    each(masterData.category, function(k,a) {
      if (categoryEditable(k)) {
        currentEvent.category_id=k;
        return false;
      }
    });
    if (currentEvent.category_id==null) {
      if (masterData["edit category"]!=null) {
        alert("Um einen Termin anzulegen, muss erst ein Kalender erstellt werden!");
        editCategory(null, 0);
      }
      return null;
    }
  }
  var rows = new Array();
  
  
  
  rows.push('<div id="cal_menu"><br/></div>');
  rows.push('<div id="cal_content"></div>');
    
  
  var elem=form_showDialog((currentEvent.id==null?"Neuen Termin erstellen":"Termin editieren"), rows.join(""), 560, 600, {
    "Termin speichern": function() {
      if (saveEvent(event))
        $(this).dialog("close");
    }
  });
  
  _renderEditEventContent(elem, currentEvent);
  
  if (currentEvent.id!=null) {
    // Erst mal checken, ob eine Wiederholung angeklickt wurde
    if ((currentDate!=null) && (currentEvent.startdate.toStringDe()!=currentDate.toStringDe())) {
      elem.dialog('addbutton', 'Nur aktuellen Termin entfernen', function() {
        if (currentEvent.events!=null && !confirm("Achtung, da der Termin mit "+masterData.churchservice_name+" verknüpft ist, hat jede Änderung auch dort Auswirkungen. Dies kann auch angefragt Dienste betreffen!"))
          return null;
        if (confirm("Ausnahme für den "+currentDate.toStringDe()+" wirklich hinzufügen?")) {
          currentEvent_addException(currentDate);
          saveEvent(currentEvent);
          elem.dialog("close");
        }
      });
      
    }
    else {
      elem.dialog('addbutton', 'Löschen', function() {
        var txt="Termin '"+event.bezeichnung+"' wirklich entfernen?";
        if (currentEvent.event_id) txt=txt+" Achtung, zugeordnete Dienste werden damit abgesagt!";
        if (confirm(txt)) {
          delEvent(currentEvent, function() {
            elem.dialog("close");
          });
        }
      });
    }
  }
  elem.dialog('addbutton', 'Abbrechen', function() {
    $(this).dialog("close");
  });

  _renderEditEventNavi(elem, currentEvent);
 
}

function copyEvent(current_event) {
  var event=$.extend({},current_event);
  event.orig_id=event.id;
  event.id=null;
  event.events=null;
  event.copyevent=true;
  event.copychurchservice=false;
  editEvent(event, "week");
}


function delEvent(event, func) {
  calCCType.hideData(event.category_id);
  if (event.bookings!=null) {
    each(event.bookings, function(k,a) {
      a.status_id=99;
    });
  }
  churchInterface.jsendWrite({func:"deleteEvent", id:event.id}, function() {
    calCCType.needData(event.category_id, true);
    if (func!=null) func();
  });
}

function delEventFormular(event, func, currentDate) {
  if (event.repeat_id>0) {
    var txt="Es handelt sich um einen Termin mit Wiederholungen, welche Termine sollen entfernt werden?";
    if (event.event_id) txt=txt+" <br><b>Achtung, zugeordnete Dienste werden damit abgesagt!</b>";
    var elem=form_showDialog("Was soll gelöscht werden?", txt, 350, 300, {
      "Alle": function() {
                delEvent(event, func);
                elem.dialog("close");
              },
      "Nur aktueller": function() {
                         currentEvent_addException(currentDate);
                         saveEvent(event);
                         elem.dialog("close");
                       },
      "Abbrechen": function() { elem.dialog("close"); }
    });
  }
  else {
    var txt="Termin '"+event.bezeichnung+"' wirklich entfernen?";
    if (currentEvent.event_id) txt=txt+" Achtung, zugeordnete Dienste werden damit abgesagt!";
    if (confirm(txt)) {
      delEvent(event, func);
    }
  }
}

function _viewChanged(view) {
  if (debug) console.log("_viewChanged", view);
    
  if (saveSettingTimer!=null) window.clearTimeout(saveSettingTimer);
  saveSettingTimer=window.setTimeout(function() {
    if ((masterData.settings["viewName"]==null) || (masterData.settings["viewName"]!=view.name)) {
      masterData.settings["viewName"]=view.name;
      churchInterface.jsendWrite({func:"saveSetting", sub:"viewName", val:view.name});
    }
    if ((masterData.settings["startDate"]==null) || (masterData.settings["startDate"]!=view.start.format(DATEFORMAT_EN))) {
      masterData.settings["startDate"]=view.start.format(DATEFORMAT_EN);
      churchInterface.jsendWrite({func:"saveSetting", sub:"startDate", val:view.start.format(DATEFORMAT_EN)});
    }
    saveSettingTimer=null;
  },700);
}

function categoryEditable(category_id) {
  if (category_id==null || masterData.category[category_id]==null) return false;
  
  if (user_access("edit category", category_id))
    return true;

  return false;
}

/**
 * Checks for admin rights to change name and color of category
 * @param category_id
 * @returns {Boolean}
 */
function categoryAdminable(category_id) {
  if (!categoryEditable(category_id)) return false;
  
  var cat=masterData.category[category_id];
  
  if (cat.oeffentlich_yn==0 & cat.privat_yn==1 && user_access("admin personal category"))
    return true;
  else if (cat.oeffentlich_yn==0 & cat.privat_yn==0 && user_access("admin group category"))
    return true;
  else if (cat.oeffentlich_yn==1 & cat.privat_yn==0 && user_access("admin church category"))
    return true;
  
  if (masterData.category[category_id].modified_pid==masterData.user_pid) return true;
  
  return false;
}

function _eventClick(event, jsEvent, view ) {
  if (debug) console.log("_eventClick", event, jsEvent, view);
  clearTooltip(true);
  
  var myEvent=getEventFromEventSource(event);
  if ((myEvent!=null) && (categoryEditable(myEvent.category_id))) {
    editEvent(myEvent, view.name=="month", event.start.format(DATETIMEFORMAT_EN).toDateEn(true), jsEvent);
  }
  else {
    var rows = new Array();
    rows.push('<legend>'+event.title+'</legend>');
    rows.push('<p>'+_("start.date")+': '+event.start.format(event.start.hasTime()?DATETIMEFORMAT_DE:DATEFORMAT_DE));
    if (event.end!=null)
      rows.push('<p>'+_("end.date")+': '+event.end.format(event.end.hasTime()?DATETIMEFORMAT_DE:DATEFORMAT_DE));    
    form_showOkDialog("Termin: "+event.title, rows.join(""), 400, 400);
  }
  
}

function _calcCalendarHeight() {
  if (printview) return 1000;
  var height=$( window ).height()-150;
  if (height>1000) height=1000;
  else if (height<400) height=400;
  return height;
}

function initCalendarView() {
  calendar=$('#calendar');
  var d=new Date();
  if ($("#init_startdate").val()!=null)
    d=$("#init_startdate").val().toDateEn(true);
  if (d==null && masterData.settings.startDate!=null)
    d=masterData.settings.startDate.toDateEn();
  var height=$( window ).height()-150;
  if (height>1000) height=1000;
  if (viewName=="calView") {
    calendar.fullCalendar({
      year: d.getFullYear(),
      month:d.getMonth(),
      date:  d.getDate(),
      header: {
        left: 'prev,next today',
        center: 'title',
        right: 'agendaDay,agendaWeek,month'
      },
      //aspectRatio: 1.7,
      firstDay:masterData.firstDayInWeek,
      contentHeight: _calcCalendarHeight(),
      defaultEventMinutes:90,
      editable: true,
      monthNames: getMonthNames(),
      weekNumbers: true,
      weekNumberTitle : "",
      monthNamesShort: monthNamesShort,
      dayNames: dayNames,
      dayNamesShort: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
      buttonText: {
        prev:     '<<',  // left triangle
        next:     '>>',  // right triangle
        prevYear: '<<', // <<
        nextYear: '>>', // >>
        today:    _("today"),
        month:    _("month"),
        week:     _("week"),
        day:      _("day")
      },
      timeFormat: {
        // for agendaWeek and agendaDay
        agenda: 'H:mm', // 5:00

        // for all other views
        month: "H(:mm)[h]"  // 7p
      },
      // No Text for allDay, not necessary
      allDayText:'',
      firstHour:10,
      defaultView:((masterData.settings!=null)&&(masterData.settings["viewName"]!=null)?masterData.settings["viewName"]:"month"),
      axisFormat:"H:mm",
      columnFormat : {
        month: 'ddd',    // Mon
        week: 'ddd D.M.', // Mon 9/7
        day: 'dddd D.M.'  // Monday 9/7
      },
      eventLimit: {
        'month': 6, // adjust to 6 only for agendaWeek/agendaDay
        'default': true // give the default value to other views
      },
      eventLimitText: _("more"),
      eventDragStart:  function() {clearTooltip(true); },
      eventResizeStart:  function() {clearTooltip(true); },
      eventDrop: _eventDrop,
      eventResize: _eventResize,
      viewRender: _viewChanged,
      eventClick: _eventClick,
      eventMouseover: _eventMouseover,
      eventMouseout: function(calEvent, jsEvent) {
        clearTooltip(false);
      },
      eventRender: function (event, element) {
        element.find('.fc-title').html(element.find('.fc-title').text());
      },
      selectable:true,
      selectHelper:true,
      select: _select
    });
    if (!embedded)
      $("div.fc-left").append("&nbsp; "+form_renderImage({src:"cal.png", width:28, htmlclass:"open-cal", link:true})+'<div style="position:absolute;z-index:12001" id="dp_month"></div>');
    $("div.fc-left").append(" "+form_renderImage({src:"printer.png", width:28, htmlclass:"printview", link:true})+'<div style="position:absolute;z-index:12001" id="dp_month"></div>');
    if (!embedded) {
//      $("div.fc-right>div.fc-button-group").append('<button type="button" id="yearView" class="fc-button fc-state-default fc-corner-right">'+_("year")+'</button>');
      $("div.fc-right>div.fc-button-group").append('<button type="button" id="eventView" class="fc-button fc-state-default fc-corner-right"><i class="icon-list"></button>');
    }
    $( window ).resize(function() {
      calendar.fullCalendar('option', 'contentHeight', _calcCalendarHeight());
      style="overflow:scroll;height:'+(_calcCalendarHeight()+20)+'px"      
    });
    $("#header").html("");
    if ($("#viewdate").val()!=null) {
      var viewdate=$("#viewdate").val().toDateEn();
      calendar.fullCalendar( 'gotoDate', viewdate);
    }
  }
  else if (viewName=="yearView") {
    calendar.yearCalendar({});
    $("#header").append('<button type="button" id="calView" style="overflow:inherit" class="fc-button fc-state-default fc-corner-right">'+_("calendar")+'</button>');
    $("#header").append('<button type="button" id="eventView" class="fc-button fc-state-default fc-corner-right"><i class="icon-list"></button>');
  }
  else if (viewName=="eventView") {
    var enddate=null;
    if ($("#init_enddate").val()!=null)
      enddate=$("#init_enddate").val().toDateEn(true);
    calendar.eventCalendar({startdate:d, enddate:enddate});
    $("#header").append(form_renderInput({controlgroup:false, cssid:"searchEntry", placeholder:_("search"),htmlclass:"input-medium search-query"}));
    $("#header").append('<button type="button" id="calView" style="overflow:inherit" class="fc-button fc-state-default fc-corner-right">'+_("calendar")+'</button>');
  }
  else
    alert("Unkwnown viewname!");
  $("a.open-cal").click(function() {
    form_implantDatePicker('dp_month', masterData.settings["startDate"].toDateEn(), function(dateText) {
      var viewdate=dateText.toDateDe();
      calendar.fullCalendar( 'gotoDate', viewdate);
      calendar.fullCalendar('render');
      
    });
  });
  
  $("a.printview").click(function() {
    if (printview) {
      window.print();
    }
    else {
      var fenster=window.open("?q=churchcal&embedded=true&printview=true", '_blank', 'location=yes,height=570,width=700,scrollbars=yes,status=yes');
      fenster.focus();
    }
  });
      
  $("#calView").click(function(k) {
    window.location.href="?q=churchcal&viewname=calView";
  });
  $("#yearView").click(function(k) {
    window.location.href="?q=churchcal&viewname=yearView";
  });
  $("#eventView").click(function(k) {
    window.location.href="?q=churchcal&viewname=eventView";
  });
  $("#searchEntry").keyup(function() {
    filterName=$(this).val();
    send2Calendar("render");
  });
  $("#searchEntry").focus();
}

function send2Calendar(a,b) {
  if (viewName=="calView")
    calendar.fullCalendar(a,b);
  else if (viewName=="yearView")
    calendar.yearCalendar(a,b);
  else if (viewName=="eventView")
    calendar.eventCalendar(a,b);
  else alert("Unbekannter send Calendar");
  
}

function renderTooltip(event) {
  var rows = new Array();
  var title = event.title;
  rows.push('<div id="tooltip_inner" class="CalView">');
  rows.push('<ul><li>');
  
  var start_txt=event.start.format(event.start.hasTime()?DATETIMEFORMAT_DE:DATEFORMAT_DE);
  
  if (event.end==null)
    rows.push(start_txt);
  else {
    if (!event.end.isSame(event.start, "day")) {
      rows.push(start_txt);
      if (event.end.hasTime())
        rows.push(' - '+event.end.format(DATETIMEFORMAT_DE));
      else { 
        var end=event.end.format(DATEFORMAT_EN).toDateEn(false);
        end.addDays(-1);
        if (end.toStringDe(false)!=start_txt)
        rows.push(' - '+end.toStringDe(false));
      }
    }
    else {
      rows.push(start_txt);
      rows.push(' - '+event.end.format("HH:mm"));  
    }
  }
  
  var myEvent=getEventFromEventSource(event);
  if (myEvent!=null) {
    myEvent.allDay=event.allDay;
    title=myEvent.bezeichnung;
    if (myEvent.intern_yn==1) title=title+" (intern)";

    if (categoryEditable(myEvent.category_id)) {
      title=title+'<span class="pull-right">&nbsp;<nobr>'+form_renderImage({cssid:"copyevent", label:"Kopieren", src:"copy.png", width:20});
      title=title+"&nbsp;"+form_renderImage({cssid:"delevent", label:'Löschen', src:"trashbox.png", width:20})+"</nobr></span>";
    }
    
    // Now get the service texts out of the events
    if (myEvent.events!=null) {
      each(myEvent.events, function(i,e) {
        if ((e.service_texts!=null) &&
             (e.startdate.toDateEn(false).toStringEn(false)==event.start.format(DATEFORMAT_EN))) {
          title=title+' <span class="event-servicetext">'+e.service_texts.join(", ")+'</span>';
          return false;
        }
      });
    }
    
    if ((myEvent.ort!=null) && (myEvent.ort!=""))
      rows.push('<li><b>'+myEvent.ort+'</b>');
    if (myEvent.category_id!=null)
      rows.push("<li>Kalender: <i>"+masterData.category[myEvent.category_id].bezeichnung+'</i>');
    if (myEvent.bookings!=null) {
      rows.push('<li>Angefragte Resourcen<small><ul>');
      each(myEvent.bookings, function(i,e) {
        rows.push('<li>'+masterData.resources[e.resource_id].bezeichnung.trim(30));
      });
      rows.push('</ul></small>');
    }
    if ((myEvent.notizen!=null) && (myEvent.notizen!=""))
      rows.push('<li>'+_("comment")+': <small> '+myEvent.notizen.trim(60)+'</small>');
    if ((myEvent.link!=null) && (myEvent.link!=""))
      rows.push('<li>Link: <small> <a href="'+myEvent.link+'" target="_clean">'+myEvent.link+'</a></small>');    
    
  }
  if (event.status!=null)
    rows.push('<li>Status: '+event.status);
  rows.push('</ul>');
  
  // A calender event
  if (myEvent!=null) {
    if ((!embedded) && (myEvent.booking_id!=null) && (masterData.auth["view churchresource"]))
      rows.push('<a href="?q=churchresource&id='+myEvent.booking_id+'"><span class="label label-info">'+masterData.churchresource_name+'</label></a>&nbsp;');
    if ((!embedded) && (myEvent.event_id!=null))
      rows.push('<a href="?q=churchservice&id='+myEvent.event_id+'"><span class="label label-info">'+masterData.churchservice_name+'</label></a>&nbsp;');
    if (myEvent.meetingRequest!=null) {
      rows.push('<h5>Info Besprechungsanfrage</h5>');
      var confirm=0, decline=0, offen=0, perhaps=0;
      each(myEvent.meetingRequest, function(k,a) {
        if (a.zugesagt_yn==1) confirm=confirm+1;
        else if (a.zugesagt_yn==0) decline=decline+1;
        else if (a.response_date!=null) perhaps=perhaps+1;
        else offen=offen+1;
      });
      if (confirm>0)
        rows.push('<span class="badge badge-success">'+confirm+'</span> Zusage<br/>');
      if (perhaps>0)
        rows.push('<span class="badge">'+perhaps+'</span> Vielleicht<br/>');
      if (decline>0)
        rows.push('<span class="badge badge-important">'+decline+'</span> Absage<br/>');
      if (offen>0)
        rows.push('<span class="badge badge-info">'+offen+'</span> Offen');
    }
  }
  else {
    if (event.source==null) return null;
    
    if (event.bezeichnung!=null)
      title=title+" ("+event.bezeichnung+")";

    rows.push("<small><i>Termin von ");
    rows.push(event.source.container.data[event.source.category_id].name);
    rows.push("</i></small>");
  }
  
  rows.push('</div>');
  
  return [rows.join(""), title];
}

function _eventMouseover(event, jsEvent, view) {
  if (debug) console.log("_eventMouseover", event, jsEvent, view);

  if (event.source==null) return;
  
  var placement="bottom";
  if (jsEvent.pageX>$("#calendar").width()+$("#calendar").position().left-100)
    placement="left";
  else if (jsEvent.pageY>$("#calendar").height()+$("#calendar").position().top-150)
    placement="top";
  else if (jsEvent.pageX<$("#calendar").position().left+130)
    placement="right";

  $(this).tooltips({
    data:{id:"1", event:event},
    show:true,
    container:"#calendar",
    placement:placement,
    auto:false,
    render:function(data) {
      $("#mypop").remove();
      return renderTooltip(data.event);
    },
    afterRender:function(element, data) {
      var event=getEventFromEventSource(data.event);
      $("#copyevent").click(function() {
        clearTooltip(true);
        copyEvent(event);
        return false;
      });
      $("#editevent").click(function() {
        clearTooltip(true);
        editEvent(event);
        return false;
      });
      $("#delevent").click(function() {
        clearTooltip(true);
        currentDate=data.event.start;
        currentEvent=event;
        delEventFormular(event, null, data.event.start.format(DATETIMEFORMAT_EN).toDateEn(true));
        return false;
      });
    }
  });
  $(this).tooltips("show");
}

function createMultiselect(name, data) {
  var t=this;
  filter[name]=new CC_MultiSelect(data, function(id, selected) {
    masterData.settings[name]=this.getSelectedAsArrayString();
    churchInterface.jsendWrite({func:"saveSetting", sub:name, val:masterData.settings[name]});
    if (id=="allSelected") {
      if (filter[name]!=null) {
        each(filter[name].data, function(k,a) {
          if (churchcore_inArray(k,filter[name].selected))
            needData(name, k);
          else
            hideData(name, k);
        });
      }
    }
    else {
      if (name=="filterGemeindekalendar" && (id==6 || id==4)) {
        var counterpart=(id==4?6:4);
        if (filter[name].isSelected(counterpart)) {
          hideData(name, counterpart);
          filter[name].toggleSelected(counterpart);
          filterMultiselect("filterGemeindekalendar", (!embedded?masterData.maincal_name:"Kalender"));
        }
      }
      if (selected)
        needData(name, id);
      else
        hideData(name, id);
    }
  });
  if (name=="filterGemeindekalendar") {
    if ($('#filtercategory_select').val()!=null) {
      var arr= new Array();
      each($('#filtercategory_select').val().split(","), function(k,a) {
        arr.push(a*1+100);
      });
      masterData.settings[name]="["+arr.join(",")+"]";
    }
    if (masterData.settings[name]==null)
      filter[name].selectAll();
    else filter[name].setSelectedAsArrayString(masterData.settings[name]);
  }
  else
    filter[name].setSelectedAsArrayString(masterData.settings[name]);
}
function filterMultiselect(name, label) {
  if (filter[name]!=null) {
    filter[name].render2Div(name, {label:label, controlgroup:!embedded});
  }
}

function _loadAllowedGroups(func) {
  var elem=form_showCancelDialog(_("load.data"),"");
  churchInterface.jsendRead({func:"getAllowedGroups"}, function(ok, data) {
    elem.dialog("close");
    if (!ok) {
      alert("Fehler beim Holen der Gruppen: "+data);
      masterData.groups=new Array();
    }
    else {
      masterData.groups=data;
      if (masterData.groups==null) masterData.groups=new Array();
      func();
    }
  });
}

function _loadAllowedPersons(func) {
  var elem=form_showCancelDialog(_("load.data"),"");
  churchInterface.jsendRead({func:"getAllowedPersons"}, function(ok, data) {
    elem.dialog("close");
    if (!ok) {
      alert("Fehler beim Holen der Personen: "+data);
      allPersons=new Array();
    }
    else {
      allPersons=new Object();
      if (data!=null) {
        each(data, function(k,a) {
          allPersons[a.p_id]=new Object();
          allPersons[a.p_id].bezeichnung=a.name+", "+a.vorname;
          if (a.spitzname!="") allPersons[a.p_id].bezeichnung=allPersons[a.p_id].bezeichnung+" ("+a.spitzname+")";
          allPersons[a.p_id].id=a.p_id;
        });
      }
      func();
    }
  });
}

function editCategory(cat_id, privat_yn, oeffentlich_yn) {
  var current=$.extend({}, masterData.category[cat_id]);
  if (privat_yn==null) privat_yn==masterData.category[cat_id].privat_yn!=0;
  if (oeffentlich_yn==null) privat_yn==masterData.category[cat_id].oeffentlich_yn!=0;
  if (current.sortkey==null) current.sortkey=0;
  
  var form = new CC_Form((cat_id==null?"Kalender erstellen":"Kalender editieren"), current);
  
  if ((cat_id==null) && (privat_yn==0) && (oeffentlich_yn==0)) {
    if (masterData.groups==null) {
      _loadAllowedGroups(function() {editCategory(cat_id, privat_yn, oeffentlich_yn)});
      return false;
    }
    form.addSelect({label:"f&uuml;r Gruppe", freeoption:true, cssid:"accessgroup", data:masterData.groups});
    form.addCaption({text:"<p><small>Hier kann eine Gruppen angegeben werden, die automatisch die Berechtigung erh&auml;lt den Kalender zu sehen</small></p>"});
    form.addCheckbox({label:"Gruppenteilnehmer erhalten Schreibrechte", cssid:"writeaccess", checked:false});
  }
  form.addInput({label:"Bezeichnung", cssid:"bezeichnung", required:true});
  //form.addInput({label:"Farbe", cssid:"color"});
  form.addHtml('<span class="color"></span>');
  form.addInput({label:"Sortierungsnummer", cssid:"sortkey"});

  form.addHtml('<p><p><p class="pull-right"><small>#'+cat_id);

  var elem = form_showDialog((cat_id==null?"Kalender erstellen":"Kalender bearbeiten"), form.render(false, "horizontal"), 500, 500, {
    "Speichern": function() {
      var obj = form.getAllValsAsObject();
      obj.color=current.color;
      if (obj.color==null) obj.color="black";
      obj.privat_yn=privat_yn;
      obj.oeffentlich_yn=oeffentlich_yn;
      if (oeffentlich_yn==1)
        obj.privat_yn=0;
      obj.func="saveCategory";
      obj.id=cat_id;
      elem.html("<legend>Speichere Daten...</legend>");
      churchInterface.jsendWrite(obj, function(ok, data) {
        if (!ok) alert("Es ist ein Fehler aufgetreten:"+data)
        else {
          obj.id=data;
          if (cat_id==null) obj.modified_pid=masterData.user_pid;
          else obj.modified_pid=masterData.category[data].modified_pid;
          masterData.category[data]=obj;
          elem.dialog("close");
        }
      });
    },
    "Abbruch": function() {
      elem.dialog("close");
    }
  });
  form_renderColorPicker({label:"Farbe", value:current.color, elem:elem.find("span.color"), func:function() {
    current.color=$(this).val();
  }});
  elem.find("#accessgroup").change(function() {
    if ($(this).val()!="") elem.find("#bezeichnung").val(masterData.groups[$(this).val()].bezeichnung);
  });
}

function shareCategory(cat_id, privat_yn, oeffentlich_yn) {
  if (masterData.groups==null) {
    _loadAllowedGroups(function() {shareCategory(cat_id, privat_yn, oeffentlich_yn);});
    return false;
  }
  if (allPersons==null) {
    _loadAllowedPersons(function() {shareCategory(cat_id, privat_yn, oeffentlich_yn);});
    return false;
  }
  var dlg=form_showCancelDialog(_("load.data"),"");
  churchInterface.jsendRead({func:"getShares", cat_id:cat_id}, function(ok, data) {
    dlg.dialog("close");
    if (!ok) alert("Fehler: "+data);
    else {
      current=$.extend({}, masterData.category[cat_id]);
      if (current.sortkey==null) current.sortkey=0;
      if (data.person!=null) {
        if (data.person[403]!=null)
          current.personRead=data.person[403].splice(",");
        if (data.person[404]!=null)
          current.personWrite=data.person[404].splice(",");
      }
      if (data.gruppe!=null) {
        if (data.gruppe[403]!=null)
          current.gruppeRead=data.gruppe[403].splice(",");
        if (data.gruppe[404]!=null)
          current.gruppeWrite=data.gruppe[404].splice(",");
      }
      
      var form = new CC_Form(null, current);
      form.addHtml('<legend>Kalender f&uuml;r Personen freigeben</legend>');

      form.addHtml('<div class="control-group"><label class="control-label">Lesezugriff</label>');
      form.addHtml('<div class="controls" id="personRead">');
      form.addHtml('</div></div>');
      form.addHtml('<div class="control-group"><label class="control-label">Schreibzugriff</label>');
      form.addHtml('<div class="controls" id="personWrite">');
      form.addHtml('</div></div>');

      
      form.addHtml('<legend>Kalender f&uuml;r Gruppen freigeben</legend>');
      form.addHtml('<div class="control-group"><label class="control-label">Lesezugriff</label>');
      form.addHtml('<div class="controls" id="gruppeRead">');
      form.addHtml('</div></div>');
      form.addHtml('<div class="control-group"><label class="control-label">Schreibzugriff</label>');
      form.addHtml('<div class="controls" id="gruppeWrite">');
      

      var elem = form_showDialog("Kalender '"+masterData.category[cat_id].bezeichnung+"' freigeben", form.render(false, "horizontal"), 500, 500, {
        "Speichern": function() {
          var obj = form.getAllValsAsObject();
          obj["person"]=new Object();
          obj["person"][403]=current.personRead;
          obj["person"][404]=current.personWrite;
          obj["gruppe"]=new Object();
          obj["gruppe"][403]=current.gruppeRead;
          obj["gruppe"][404]=current.gruppeWrite;
          obj.cat_id=cat_id;
          elem.html("<legend>Speichere Daten...</legend>");
          obj.func="saveShares";
          churchInterface.jsendWrite(obj, function(ok, data) {
            if (!ok) alert("Es ist ein Fehler aufgetreten:"+data)
            else {
              elem.dialog("close");
              editCategories(privat_yn, oeffentlich_yn);
            }
          });
        },
        "Abbruch": function() {
          elem.dialog("close");
          editCategories(privat_yn, oeffentlich_yn);
        }
      });
      form_renderLabelList(current, "personRead", allPersons);
      form_renderLabelList(current, "personWrite", allPersons);
      form_renderLabelList(current, "gruppeRead", masterData.groups);
      form_renderLabelList(current, "gruppeWrite", masterData.groups);
    }
  });
}

function editCategories(privat_yn, oeffentlich_yn, reload) {
  var rows = new Array();
  if (reload==null) reload=false;
  if (privat_yn==1)
    rows.push('<legend>Pers&ouml;nliche Kalender</legend>');
  else if (oeffentlich_yn==0)
    rows.push('<legend>'+_("group.calendar")+'</legend>');
  else
    rows.push('<legend>'+masterData.maincal_name+'</legend>');
  rows.push('<table class="table table-condensed">');
  rows.push('<tr><th width="20px"><th>Bezeichnung<th width="40px">');
  rows.push('<th width="25px">');
  
  rows.push('<th width="25px"><th width="25px">');
  
  each(churchcore_sortData(masterData.category, "sortkey"), function(k,cat) {
    if ((cat.oeffentlich_yn==oeffentlich_yn) && (cat.privat_yn==privat_yn)) {
      rows.push('<tr><td>'+form_renderColor(cat.color));
      rows.push('<td>'+cat.bezeichnung);
      rows.push('<td><a href="#" class="ical" data-id="'+cat.id+'"><span class="label">iCal</span></a>');
      if (categoryAdminable(cat.id)) {
        rows.push('<td>'+form_renderImage({src:"persons.png", width:20, htmlclass:"share", link:true, data:[{name:"id", value:cat.id}]}));
        rows.push('<td>'+form_renderImage({src:"options.png", width:20, htmlclass:"options", link:true, data:[{name:"id", value:cat.id}]}));
        rows.push('<td>'+form_renderImage({src:"trashbox.png", width:20, htmlclass:"delete", link:true, data:[{name:"id", value:cat.id}]}));
      }
      else rows.push('<td><td><td>');
    }
  });

  if (
       ((privat_yn==1) && (user_access("create personal category || admin personal category")))
       || ((privat_yn==0) && (oeffentlich_yn==0) && (user_access("create group category || admin group category")))
       || ((privat_yn==0) && (oeffentlich_yn==1) && (user_access("admin church category")))
      )
    rows.push('<tr><td><td><a href="#" class="add"><i>Neuen Kalender erstellen</i></a><td><td><td>'+form_renderImage({link:true, htmlclass:"add", src:"plus.png", width:20})+"<td>");
  
  rows.push('</table>');
  var elem = form_showDialog("Kalender verwalten", rows.join(""), 500, 500, {
    "Schliessen": function() {
      elem.dialog("close");
      if (reload) window.location.reload();
    }
  });
  
  elem.find("a.options, a.add").click(function() {
    elem.dialog("close");
    editCategory($(this).attr("data-id"), privat_yn, oeffentlich_yn);
    return false;
  });
  elem.find("a.share").click(function() {
    elem.dialog("close");
    shareCategory($(this).attr("data-id"), privat_yn, oeffentlich_yn);
    return false;
  });
  elem.find("a.ical").click(function() {
    showICalDialog($(this).attr("data-id"));
    return false;
  });
  elem.find("a.delete").click(function() {
    var id=$(this).attr("data-id");
    if (confirm("Wirklich den Kalender "+masterData.category[id].bezeichnung+" und alle seine Daten entfernen?")) {
      churchInterface.jsendWrite({func:"deleteCategory", id:id}, function(ok, info) {
        if (!ok) alert("Es ist ein Fehler aufgetreten: "+info);
        else {
          calCCType.hideData(id);
          delete masterData.category[id];
          elem.dialog("close");
          editCategories(privat_yn, oeffentlich_yn, true);
        }
      });
    }
  });
}

function showICalDialog(id) {
  var rows=new Array();
  rows.push('<legend>Kalender abonnieren</legend>Der Kalender kann abonniert werden. Hierzu kann die Adresse anbei in einen beliebigen Kalender importiert werden,'+
             ' der iCal unterst&uuml;tzt.<br><br>');
  rows.push(form_renderInput({label:"<a target='_clean' href='"+masterData.base_url+"?q=churchcal/ical&security="+masterData.category[id].randomurl+"&id="+id+"'>iCal-URL</a>", htmlclass:"ical-link", value:masterData.base_url+"?q=churchcal/ical&security="+masterData.category[id].randomurl+"&id="+id, disable:true}));
  var elem=form_showOkDialog("Kalender abonnieren", rows.join(""));
  elem.find("input.ical-link").select();
  
}

function needData(filtername, id) {
  if ((filtername=="filterRessourcen")) {
    calResourceType.needData(id);
  }
  else {
    // Wenn es sich um wirklich Kalendardaten handelt dann ist id>100, habe ich ja vorher addiert
    if (id>=100) {
      calCCType.needData(id-100);
      if ((filter["filterGruppenKalender"]!=null) && (churchcore_inArray(5, filter["filterGruppenKalender"].selected)))
        calAbsentsType.needData(0);
    }
    else if (id==1) calMyServicesType.needData(0);
    else if (id==2) calMyAbsentsType.needData(0);
    else if (id==4) calBirthdayType.needData(0);
    else if (id==5) calAbsentsType.needData(0);
    else if (id==6) calAllBirthdayType.needData(0);
  }
}
function hideData(filtername, id) {
  if ((filtername=="filterRessourcen")) {
    calResourceType.hideData(id);
  }
  else {
    // Wenn es sich um wirklich Kalendardaten handelt dann ist id>100, habe ich ja vorher addiert
    if (id>=100) {
      calCCType.hideData(id-100);
      if ((filter["filterGruppenKalender"]!=null) && (churchcore_inArray(5, filter["filterGruppenKalender"].selected))) {
        calAbsentsType.hideData(0);
        calAbsentsType.needData(0);
      }
    }
    else if (id==1) calMyServicesType.hideData(0);
    else if (id==2) calMyAbsentsType.hideData(0);
    else if (id==4) calBirthdayType.hideData(0);
    else if (id==5) calAbsentsType.hideData(0);
    else if (id==6) calAllBirthdayType.hideData(0);
  }
}

function renderChurchCategories() {
  var rows= new Array();
  if (viewName!="yearView") {
    var sortkey=0;
    var form=new CC_Form();

    if (!embedded) {
      form = new CC_Form(masterData.maincal_name+" "+form_renderImage({cssid:"edit_church", src:"options.png", top:8, width:24, htmlclass:"pull-right"}));
      form.setHelp("Gemeindekalender");
    }

    oeff_cals=new Object();
    if (churchcore_countObjectElements(masterData.category)>0) {
      if (embedded) {
        var dabei=false;
        each(churchcore_sortMasterData(masterData.category), function(k,a) {
          if ((a.oeffentlich_yn==0) && (a.privat_yn==0) && ((filterCategoryIds==null) || (churchcore_inArray(a.id, filterCategoryIds)))) {
            dabei=true;
            var title=a.bezeichnung;
            form_addEntryToSelectArray(oeff_cals,(a.id*1+100),title,sortkey);
            sortkey++;
          }
        });
        if (dabei) form_addEntryToSelectArray(oeff_cals,-2,'-',sortkey);  sortkey++;
      }

      each(churchcore_sortMasterData(masterData.category), function(k,a) {
        if ((a.oeffentlich_yn==1) && ((filterCategoryIds==null) || (churchcore_inArray(a.id, filterCategoryIds)))) {
          var title=a.bezeichnung;
          form_addEntryToSelectArray(oeff_cals,(a.id*1+100),title,sortkey);
          sortkey++;
        }
      });
    }
    
    if (masterData.auth["view churchdb"]) {
      if (sortkey>=0) {
        form_addEntryToSelectArray(oeff_cals,3,'-',sortkey);  sortkey++;
      }
      if (masterData.auth["view alldata"]) {
        form_addEntryToSelectArray(oeff_cals,4,_("birthdays")+' (Gruppen)',sortkey, true);  sortkey++;
        form_addEntryToSelectArray(oeff_cals,6,_("birthdays")+' (Alle)',sortkey, true);  sortkey++;
      }
      else {
        form_addEntryToSelectArray(oeff_cals,6,_("birthdays"),sortkey);  sortkey++;
      }
    }
  
    
    createMultiselect("filterGemeindekalendar", oeff_cals);

    if ((embedded) && (!minical)) {
      form.addHtml('<table width="100%"><tr>');
      if ((filterCategoryIds==null) || (filterCategoryIds.length>1))
        form.addHtml('<td width="190px"><div style="width:180px" id="filterGemeindekalendar"></div>');
     
      if  (viewName=="eventView") {
        form.addHtml('<td width="110px">');
        form.addInput({controlgroup:false, cssid:"searchEntry", placeholder:"Suche",htmlclass:"input-small search-query"});
      
        form.addHtml('<td width="50px"> &nbsp;');
        form.addImage({src:'cal.png', cssid:'showminical', size:24});
        form.addHtml('<div id="minicalendar" style="display:none; position:absolute;background:#e7eef4;z-index:8001; height:240px; max-width:350px"></div>');
      }

      var title="Kalender";
      if ($("#embeddedtitle").val()!=null) title=$("#embeddedtitle").val();
      form.addHtml('<td><font class="pull-right" style="font-size:180%">'+title+'</font> &nbsp; ');
      form.addHtml("</table>");
    }
    else if (!embedded){
      form.addHtml('<div id="filterGemeindekalendar"></div>');
    }
    /*
    if ((filterCategoryIds==null || !embedded) && (masterData.auth["view churchresource"])) {
      createMultiselect("filterRessourcen", masterData.resources);
      form.addHtml('<div id="filterRessourcen"></div>');
      each(masterData.resourceTypes, function(k,a) {
        filter["filterRessourcen"].addFunction(a.bezeichnung+" w&auml;hlen", function(b) {
          return b.resourcetype_id==a.id;
        });
      });

    }*/
    
    rows.push(form.render(true));
  }
  return rows.join("");
}

function renderFilterCalender() {
  var rows = new Array ();
  
  //rows.push('<legend>Kalenderauswahl</legend>');
  
  rows.push('<div class="well filterCalender" style="overflow:scroll;height:'+(_calcCalendarHeight()+20)+'px">');
  rows.push('<div style="white-space: nowrap">');
  rows.push('<ul class="ct-ul-list">');
  
  function _renderCalenderEntry(name, id, color, desc) {
    var rows = new Array ();
    rows.push('<li class="hoveractor">');
    // Editable category, not personal calendar like service cal
    if (id>6) {
      rows.push('<span class="pull-right dropdown" data-id="'+id+'"><a href="#" class="dropdown-toggle" data-toggle="dropdown" data-id="'+id+'"><i class="icon-cog icon-white"/></a>');
      rows.push('<ul class="dropdown-menu" role="menu" aria-labelledby="dLabel">');
      rows.push('<li><a href="#" class="options show-ical">iCal Link anzeigen</a></li>');
      if (categoryAdminable(id-100)) {
        rows.push('<li><a href="#" class="options share">Freigabe-Einstellungen</a></li>');
        rows.push('<li><a href="#" class="options edit">Weitere Optionen</a></li>');
      }
      if (getNotification("category", id-100)===false)
        rows.push('<li><a href="#" class="options notification">Abonnieren</a></li>');
      else
        rows.push('<li><a href="#" class="options notification">Abo bearbeiten</a></li>');
      rows.push('</ul></span>');
      rows.push('</span></span>');
    }
        
    var checked=churchcore_inArray(id, churchcore_getArrStrAsArray(masterData.settings[name]));
    if (filterCategoryIds!=null && churchcore_inArray(id-100, filterCategoryIds)) checked=true;
    rows.push('<span '+(checked?'checked="checked"':'') + ' '
                +'data-id="'+(id)+'" '
                +'data-name="'+name+'" '
                +'data-color="'+color+'" '
                +'data-label="'+desc+'" '
                +'class="colorcheckbox" id="filterCalender_'+id+'"></span>');
    return rows.join("");
  }
  
  // Church Calendar
  rows.push('<h4>'+masterData.maincal_name);
  if (!embedded && user_access("admin church category")) {
    rows.push(form_renderImage({cssid:"edit_church", src:"options.png", top:0, width:24, htmlclass:"pull-right"}));
  }
  rows.push('</h4>');

  each(churchcore_sortData(masterData.category,"sortkey"), function(k, cat) {
    if ((cat.oeffentlich_yn==1) && (cat.privat_yn==0)) {
      rows.push(_renderCalenderEntry("filterGemeindekalendar", cat.id*1+100, cat.color, cat.bezeichnung));
    }
  });
  rows.push('</ul>');

  // Group calendar
  var rows_cal = new Array();
  each(churchcore_sortData(masterData.category,"sortkey"), function(k, cat) {
    if ((cat.oeffentlich_yn==0) && (cat.privat_yn==0)) {
      rows_cal.push(_renderCalenderEntry("filterGruppenKalender", cat.id*1+100, cat.color, cat.bezeichnung));
    }
  });
  if (!embedded && (rows_cal.length>0 || user_access("create group category"))) {
    rows.push('<ul class="ct-ul-list">');
    rows.push('<h4>'+_("group.calendar"));
    if (user_access("admin group category") || user_access("create group category"))
      rows.push(form_renderImage({cssid:"edit_group", src:"options.png", top:0, width:24, htmlclass:"pull-right"}));
    rows.push('</h4>');    
    rows.push(rows_cal.join(""));
    rows.push('</ul><ul class="ct-ul-list">');
  }

  // Personal Calendar
  var rows_cal = new Array();
  each(churchcore_sortData(masterData.category,"sortkey"), function(k, cat) {
    if ((cat.oeffentlich_yn==0) && (cat.privat_yn==1)) {
      rows_cal.push(_renderCalenderEntry("filterPersonalKalender", cat.id*1+100, cat.color, cat.bezeichnung));
    }
  });
  if (user_access("view churchservice")) {
    rows_cal.push(_renderCalenderEntry("filterPersonalKalender", 1, "blue", 'Meine Dienste'));
    rows_cal.push(_renderCalenderEntry("filterPersonalKalender", 2, "red", 'Meine Abwesenheiten'));
  }
  if (masterData.auth["view churchdb"]) {
    if (masterData.auth["view alldata"]) {
      rows_cal.push(_renderCalenderEntry("filterPersonalKalender", 4, "lightblue", _("birthdays")+' (Gruppen)'));
      rows_cal.push(_renderCalenderEntry("filterPersonalKalender", 6, "lightblue", _("birthdays")+' (Alle)'));
    }
    else {
      rows_cal.push(_renderCalenderEntry("filterPersonalKalender", 6, "lightblue", _("birthdays")));
    }
  }
  if (user_access("view churchservice")) {
    rows_cal.push(_renderCalenderEntry("filterGruppenKalender", 5, "lightgreen", "Abwesenheit in Gruppen"));
  }
  if (!embedded && rows_cal.length>0 || user_access("create personal category") || user_access("admin personal category")) {
    rows.push('<ul class="ct-ul-list">');
    rows.push('<h4>'+_("personal.calendar"));
    if (user_access("admin group category") || user_access("create group category"))
      rows.push(form_renderImage({cssid:"edit_personal", src:"options.png", top:0, width:24, htmlclass:"pull-right"}));
    rows.push('</h4>');    
    rows.push(rows_cal.join(""));
    rows.push('</ul><ul class="ct-ul-list">');
  }
  
  $("#filterCalender").html(rows.join(""));
  
  $( window ).resize(function() {
     $("div.filterCalender").css("height",(_calcCalendarHeight()+20)+"px");    
  });
  $("#filterCalender").find("a.options").click(function() {
    var id=$(this).parents("span").attr("data-id");
    if (id>100) id=id-100;
    if ($(this).hasClass("edit")) {
      editCategory(id);
    }
    else if ($(this).hasClass("show-ical")) {
      showICalDialog(id);
    }
    else if ($(this).hasClass("share")) {
      shareCategory(id);
    }
    else if ($(this).hasClass("notification")) {
      form_editNotification("category", id);
    }
    
  });
  
  $(".colorcheckbox").each(function() {
    $(this).colorcheckbox({
      checked : $(this).attr("checked")=="checked",
      color: $(this).attr("data-color"),
      name: $(this).attr("data-name"),
      label: $(this).attr("data-label"),
      id: $(this).attr("data-id"),
      change: function(checked, id, name) {
        var arr = churchcore_getArrStrAsArray(masterData.settings[name]);
        if (checked) {
          needData("", id);
          arr.push(id);
        }
        else {
          hideData("", id);
          arr.splice(arr.indexOf(id),1);
        }
        masterData.settings[name]="["+arr.join(",")+"]";
        churchInterface.jsendWrite({func:"saveSetting", sub:name, val:masterData.settings[name]});
      }
    });
    if ($(this).attr("checked")=="checked") {
      needData("", $(this).attr("data-id"));
    }
  });
/*
  $( window ).resize(function() {
    $(".options").each(function() {
      $(this).css("padding-left", $(this).parents("li").width());
    });  
  });

  $(".options").each(function() {
    $(this).css("margin-left", $(this).parents("li").width()-20);
  });*/
  
  $(".hoveractor").off("hover");
  $(".hoveractor").hover(
      function () {
        $(this).find("span.hoverreactor").fadeIn('fast',function() {});
      },
      function () {
        $(this).find("span.hoverreactor").fadeOut('fast');
      }
    );
}

$(document).ready(function() {
  churchInterface.setModulename("churchcal");
  if ($("#filtercategory_id").val()!=null) {
    filterCategoryIds=$("#filtercategory_id").val().split(",");
  }
  
  if ($("#printview").length!=0) {
    printview=true;
    $("#cdb_filter").hide();
  }
  if ($("#isembedded").length!=0) embedded=true;
  if ($("#isminical").length!=0) minical=true;
  if ($("#entries").length!=0) max_entries=$("#entries").val();

  churchInterface.setStatus("Lade Kennzeichen...");
  churchInterface.jsendRead({func:"getMasterData"}, function(ok, json) {
    churchInterface.clearStatus();
    masterData=json;
    
    if ($("#viewname").val()!=null) viewName=$("#viewname").val();
    initCalendarView();
    var rows= new Array();
      
    if ((viewName=="eventView") && (!embedded)) {
      rows.push('<div id="minicalendar" style="height:240px; max-width:350px"></div><br/><br/><br/>');
    }
    if (!embedded) {
      rows.push('<div id="filterCalender"></div>');
      //rows.push(renderPersonalCategories());
      //rows.push(renderGroupCategories());
      //rows.push(renderChurchCategories());
    }
    else {
      // All together in one well div.
      rows.push(renderChurchCategories());
    }
    

    $("#cdb_filter").html(rows.join(""));
    renderFilterCalender();
    
    if (!embedded) {
      filterMultiselect("filterMeineKalender", _("personal.calendar"));      
    }
    else {
      filterMultiselect("filterGemeindekalendar", _("calendar"));      
    }
    //filterMultiselect("filterGruppenKalender", _("group.calendar"));
    //filterMultiselect("filterRessourcen", _("resources"));
    
    if (embedded) {
      $("#searchEntry").keyup(function() {
        filterName=$(this).val();
        send2Calendar("render");
      });
      $("#searchEntry").keydown(function(a) {
        if (a.keyCode==13) return false;
      });
      $("#searchEntry").focus();
    }
    
    $("#edit_personal").click(function() {
      editCategories(1, 0);
      return false;
    });
    $("#edit_group").click(function() {
      editCategories(0, 0);
      return false;
    });
    $("#create_group_cal").click(function() {
      editCategory(null, 0, 0);
      return false;
    });
    $("#edit_church").click(function() {
      editCategories(0, 1);
      return false;
    });
    $("#showminical").click(function() {
      $("#minicalendar").toggle();
      return false;
    });
    $("#abo").click(function() {
      var rows=new Array();
      rows.push('<legend>Kalender abonnieren</legend>Die &ouml;ffentlichen Termine dieses Kalenders k&ouml;nnen abonniert werden. Hierzu kann die Adresse anbei in einen beliebigen Kalender importiert werden,'+
                 ' der iCal unterst&uuml;tzt.<br><br>');
      var id=$(this).attr("data-id");
//      rows.push(form_renderInput({label:"iCal-URL", value:masterData.base_url+"?q=churchcal/ical", disable:true}));
      rows.push(form_renderInput({label:"<a href='"+masterData.base_url+"?q=churchcal/ical'>iCal-URL</a>", value:masterData.base_url+"?q=churchcal/ical", disable:true}));
      form_showOkDialog("Kalender abonnieren", rows.join(""));
      return false;
    });
    
    //Sucht sich die Kalender zusammen die neu geholt werden m�ssen
    each(filter, function(k,a) {
      if (a.data!=null)
      each(a.data, function(i,s) {
        // Wenn es ausgew�hlt ist
        if (churchcore_inArray(i, a.selected)) {
          needData(k, s.id);
        }
        else {
          hideData(k, s.id);
        }
      });
    });
  });
});

