// Written by Mike Frysinger <vapier@gmail.com>.
// Released into the public domain.

function status(msg) {
	$$('[name=status]').innerText = msg;
}

// Create a packet following the spec:
// https://en.wikipedia.org/wiki/Wake-on-LAN#Magic_packet
function magicpacket(mac, pass) {
	var data = new ArrayBuffer(6 + 16 * 6 + 6 + 6);
	var bytes = new Uint8Array(data);
	var i, j, base = 0;

	// First 6 bytes should be all 0xFF.
	for (i = 0; i < 6; ++i)
		bytes[base + i] = 0xff;
	base += 6;

	// Then the MAC address is repeated 16 times.
	for (i = 0; i < 6; ++i)
		for (j = 0; j < 16 * 6; j += 6)
			bytes[base + j + i] = mac[i];
	base += 16 * 6;

	// Then 6 bytes before the pass should be 0xFF.
	for (i = 0; i < 6; ++i)
		bytes[base + i] = 0xff;
	base += 6;

	// Finally the 6 bytes of the password.
	for (i = 0; i < 6; ++i)
		bytes[base + i] = pass[i];

	return data;
}

function split_data(v) {
	var data = Array(6);
	var i, idata;

	window['sync_' + v]();

	for (i = 0; i < 6; ++i) {
		idata = $$('input[name=' + v + i + ']');
		if (!/^[0-9a-fA-F]?[0-9a-fA-F]$/.test(idata.value.replace(' ', ''))) {
			status(v + ' byte ' + i + ' is invalid; must be 2 hex characters');
			idata.focus();
			idata.setSelectionRange(0, idata.value.length);
			return false;
		}
		data[i] = parseInt(idata.value, 16);
	}

	return data;
}

function send() {
  
	status('initializing');
	
	var form = $$('form[name=settings]');
	var shost = '0.0.0.0';
	var dhost = form.host.value;
	var port = parseInt(form.port.value);

	// Get the MAC address & password to convert to packet data.
	var mac = split_data('mac');
	var pass = split_data('pass');
	var data = magicpacket(mac, pass);
	console.log('packet', new Uint8Array(data));

	var checkresult = function(s, step, result) {
		if (result < 0) {
			status('error in ' + step + ': ' + net_error_list[result]);
			chrome.sockets.udp.close(s, nullcb);
			return false;
		}
		return true;
	};

	// Create the socket ...
	chrome.sockets.udp.create({}, function(createInfo) {
		var s = createInfo.socketId;

		console.log('[create] socketInfo', createInfo);
		status('binding ' + shost);

		// Bind it locally ...
		chrome.sockets.udp.bind(s, shost, 0, function(result) {
			console.log('[bind] result', result);

			if (!checkresult(s, 'bind', result))
				return false;

			status('enabling broadcast');

			// Turn on broadcast support ...
			chrome.sockets.udp.setBroadcast(s, true, function(result) {
				console.log('[setBroadcast] result', result);

				if (!checkresult(s, 'broadcast', result))
					return false;

				status('sending to ' + dhost + ':' + port);

				// Send the backet ...
				chrome.sockets.udp.send(s, data, dhost, port, function(sendInfo) {
					console.log('[send] sendInfo', sendInfo);

					if (!checkresult(s, 'send', sendInfo.resultCode))
						return false;

					status('closing');

					// Shut it down ...
					chrome.sockets.udp.close(s, function() {
						status('sent to ' + dhost + ':' + port);
						store_settings();
					});
				});
			});
		});
	});

	// Keep the form from submitting.
	return false;
}

function sync_it(v) {
	var smany = $$('span[name=' + v + '-many]');
	var sone = $$('span[name=' + v + '-one]');

	// Sync the two sets of fields.
	var i;
	if (smany.hidden) {
		var idata = $$('input[name=' + v + ']');
		var data = idata.value.split(':');

		if (data.length != 6) {
			data = idata.value.replace(/[ :]/g, '');
			if (data.length != 6 * 2) {
				status('invalid ' + v + '; please fix');
				return false;
			}
			data = data.match(/../g);
		} else {
			for (i = 0; i < 6; ++i)
				if (data[i].length > 2) {
					status('invalid ' + v + ' please fix');
					return false;
				}
		}

		for (i = 0; i < 6; ++i)
			$$('input[name=' + v + i + ']').value = data[i];
	} else {
		var data = '';

		for (i = 0; i < 6; ++i) {
			data += $$('input[name=' + v + i + ']').value;
			if (i < 5)
				data += ':';
		}

		$$('input[name=' + v + ']').value = data;
	}
}
function sync_mac()  { return sync_it('mac');  }
function sync_pass() { return sync_it('pass'); }


function paste_mac() {
	sync_mac();

	var smany = $$('span[name=mac-many]');
	var sone = $$('span[name=mac-one]');
	smany.hidden = !smany.hidden;
	sone.hidden = !sone.hidden;

	return false;
}

function paste_pass() {
	sync_pass();

	var smany = $$('span[name=pass-many]');
	var sone = $$('span[name=pass-one]');
	smany.hidden = !smany.hidden;
	sone.hidden = !sone.hidden;

	return false;
}


/*
 * Storage logic.
 */
 
var Computers = [];

var settings_keys = [
  'cNme',
];




/*
 * Set form data based on selected computers settings.
 * uses default if not avalible.
 */
function setForm(f) {
  
		var form = $$('form[name=settings]');
		form.cNme.value = Computers[f]['cNme'] || 'Add new computer';
		form.host.value = Computers[f]['host'] || '192.168.0.255';
		form.port.value = Computers[f]['port'] || '40000';
		// We assume we only get called during init.
		paste_mac();
		form.mac.value = Computers[f]['mac'] || '20:00:00:00:00:00';
		paste_mac();
		paste_pass();
		form.pass.value = Computers[f]['pass'] || '00:00:00:00:00:00';
		paste_pass();
		
}


/*
 * Loads stored computer settings see
 * function store_settings.
 */
function load_settings() {
	
	chrome.storage.local.get(settings_keys, function(settings) {

	  if ("cNme" in settings)  {
	    
	    Computers = JSON.parse(settings['cNme']) || Computers;
	    setForm(0);
	    populateOptions();
	  }
	  
	});
	
}


/*
 * Stores localy the computers and settings.
 * changed how Mike Frysinger originaly saved
 * data to acomidate me defisit undrstanding of
 * parsing JSON format and the added computers.
 * Used a single converted string attached to
 * "cNam" key.  I am sure there is a better way.
 */
function store_settings() {
  
	var form = $$('form[name=settings]');
	sync_mac();
	sync_pass();
	
	var NodeSettings = {
	  'cNme': form.cNme.value,
		'host': form.host.value,
		'mac': form.mac.value,
		'pass': form.pass.value,
		'port': form.port.value,
	};
	
	if (Computers.length > 0) {
	  
  	for (l = 0; l < Computers.length; l++)
  	{
  	  
  	  if (Object.values(Computers[l]).indexOf(form.cNme.value) > -1) {
  	    
  	    Computers[l] = NodeSettings;
  	    settings = JSON.stringify(Computers);
        chrome.storage.local.set({'cNme':settings});
  	    return false;
  	    
  	  }
  	}
    Computers.push(NodeSettings);
	
	} else {
	  
    Computers.push(NodeSettings);

	}
	
  settings = JSON.stringify(Computers);
	chrome.storage.local.set({'cNme':settings});
	
}



/*
 * Adds the options to the select then calls
 * function so populate the form data
 */
function populateOptions() {
  
  opt = $$('select[name=cNme]');
  opt.options.length = 0;

  for (i = 0; i < Computers.length; i++) {
    
    var option = document.createElement("option");
    option.text = Computers[i]['cNme'];
    opt.add(option,i);
    
  }
  opt.selectedIndex = 0;
  setForm(0);
}


/*
 * Function to deal with populatiing the form
 * when a new slection is selected.
 */
function setConn() {
  setForm($$('select[name=cNme]').selectedIndex);
}



/*
 * Used to toggle new computer input box & slections
 * visibility.
 */
function toggleField(hideObj,showObj){
  
  hideObj.disabled=true;
  hideObj.style.display='none';
  showObj.disabled=false;
  showObj.style.display='inline';
  showObj.focus();
  
}


/*
 * Del curent slected computer
 */
function delCmp() {
  
  s = $$('select[name=cNme]');
  Computers.splice(s.selectedIndex, 1);
  s.remove(s.selectedIndex);
  setForm(0);
  populateOptions();
  store_settings();

}

  
/*
 * Shows an input box to enter new computer name.
 */
function setUpAddNode() {
  
  h = $$('input[name=newcNme]');
  s = $$('select[name=cNme]');
  toggleField(s, h);
  
}

/*
 * After new computer name is enterd hides input box and name
 * sets the form up for new computer settings
 */
function addNode() {

  h = $$('input[name=newcNme]');
  s = $$('select[name=cNme]');
  
  toggleField(h, s);
  var form = $$('form[name=settings]');
  var option = document.createElement("option");
  option.text = h.value;
  
  s.add(option,0);
  s.selectedIndex='0';
  h.value = ""
  form.host.value = '192.168.0.255';
	form.port.value = '40000';
	paste_mac();
	form.mac.value = '20:00:00:00:00:00';
	paste_mac();
	paste_pass();
	form.pass.value = '00:00:00:00:00:00';
	paste_pass();

}

/*
 * Startup.
 */
window.onload = function() {
  
	$$('input[name=send]').onclick = send;
	$$('input[name=newcNme]').onblur = addNode;
	$$('select[name=cNme]').onchange = setConn;
	$$('a[name=mac-paste]').onclick = paste_mac;
	$$('a[name=pass-paste]').onclick = paste_pass;
	$$('input[name=delBtn]').onclick = delCmp;
	$$('input[name=addBtn]').onclick = setUpAddNode;

	load_settings();
	
};
