var BlocklyProp = {};

//var selected = 'blocks';

var term = null;
var graph = null;

var baudrate = 115200;

var graph_temp_data = new Array;
var graph_data_ready = false;
var graph_connection_string = '';

var console_header_arrived = false;
var console_header = null;

var active_connection = null;

var connString = '';
var connStrYet = false;

var graph_options = {
    showPoint: false,
    fullWidth: true,
    axisX: {
        labelInterpolationFnc: function(value, index) {
            return index % 20 === 0 ? Math.round(index/20) : null
        },
        onlyInteger: true
    },
};

var graph_data = {
    series: [// add more here for more possible lines...
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        []
    ],
    labels: [0,1,2,3,4,5,6,7,8,9]
};

// Minimum client/launcher version supporting base64-encoding
var minEnc64Ver = version_as_number('0.7.0');
// Minimum client/launcher version supporting coded/verbose responses
var minCodedVer = version_as_number('0.7.5');
// Minimum client/launcher allowed for use with this system
var minVer = version_as_number(client_min_version);

function setBaudrate(_baudrate) {
    baudrate = _baudrate;
}

function serial_console() {
    var newTerminal = false;

    if (client_use_type !== 'ws') {
        if (term === null) {
            term = {
                portPath: getComPort()
            };
            newTerminal = true;
        }

        if (ports_available) {
            var url = client_url + 'serial.connect';
            url = url.replace('http', 'ws');
            var connection = new WebSocket(url);

            // When the connection is open, open com port
            connection.onopen = function () {
                connString = '';
                connStrYet = false;
                connection.send('+++ open port ' + getComPort() + (baudrate ? ' ' + baudrate : ''));
                active_connection = connection;
            };
            // Log errors
            connection.onerror = function (error) {
                console.log('WebSocket Error');
                console.log(error);
            };

            connection.onmessage = function (e) {
                var c_buf = (client_version >= minEnc64Ver) ? atob(e.data) : e.data;
                if (connStrYet) {
                    displayInTerm(c_buf);
                } else {
                    connString += c_buf;
                    if (connString.indexOf(baudrate.toString(10)) > -1) {
                        connStrYet = true;
                        if (document.getElementById('serial-conn-info')) {
                            document.getElementById('serial-conn-info').innerHTML = connString.trim();
                            // send remainder of string to terminal???  Haven't seen any leak through yet...
                        }
                    } else {
                        displayInTerm(e.data);
                    }
                }
                $('#serial_console').focus();
            };

            if (!newTerminal) {
                updateTermBox(0);
            }

            $('#console-dialog').on('hidden.bs.modal', function () {
                active_connection = null;
                connString = '';
                connStrYet = false;
                connection.close();
                if (document.getElementById('serial-conn-info')) {
                    document.getElementById('serial-conn-info').innerHTML = '';
                }
                updateTermBox(0);
                term_been_scrolled = false;
                term = null;
            });
        } else {
            active_connection = 'simulated';

            if (newTerminal) {
                displayInTerm("Simulated terminal because you are in demo mode\n");
                displayInTerm("Connection established with: " + getComPort() + "\n");
            }

            $('#console-dialog').on('hidden.bs.modal', function () {
                term_been_scrolled = false;
                active_connection = null;
                updateTermBox(0);
                term = null;
            });
        }
    } else if (client_use_type === 'ws') {
        // using Websocket-only client

        term = {
            portPath: getComPort()
        };

        var msg_to_send = {
            type: 'serial-terminal',
            outTo: 'terminal',
            portPath: getComPort(),
            baudrate: baudrate.toString(10),
            msg: 'none',
            action: 'open'
        };

        active_connection = 'websocket';
        if (document.getElementById('serial-conn-info')) {
            document.getElementById('serial-conn-info').innerHTML = 'Connection established with ' +
                    msg_to_send.portPath + ' at baudrate ' + msg_to_send.baudrate;
        }
        client_ws_connection.send(JSON.stringify(msg_to_send));

        $('#console-dialog').on('hidden.bs.modal', function () {
            if (msg_to_send.action !== 'close') { // because this is getting called multiple times...?
                msg_to_send.action = 'close';
                if (document.getElementById('serial-conn-info')) {
                    document.getElementById('serial-conn-info').innerHTML = '';
                }
                active_connection = null;
                client_ws_connection.send(JSON.stringify(msg_to_send));
            }
            term_been_scrolled = false;
            updateTermBox(0);
        });
    }

    $('#console-dialog').modal('show');
}

function graphing_console() {
        if (graph === null) {
            graph_reset();
            scope_data_bytes = [];
            graph = new Chartist.Line('#serial_graphing', graph_data, graph_options);
        } else {
            graph.update(graph_data, graph_options);
        }

        if (client_use_type !== 'ws' && ports_available) {
            var url = client_url + 'serial.connect';
            url = url.replace('http', 'ws');
            var connection = new WebSocket(url);

            // When the connection is open, open com port
            connection.onopen = function () {
                if (baudrate) {
                    connection.send('+++ open port ' + getComPort() + ' ' + baudrate);
                } else {
                    connection.send('+++ open port ' + getComPort());
                }
            };
            // Log errors
            connection.onerror = function (error) {
                console.log('WebSocket Error');
                console.log(error);
                //connection.close();
                //connection = new WebSocket(url);
            };

            connection.onmessage = function (e) {
                var c_buf = (client_version >= minEnc64Ver) ? atob(e.data) : e.data;
                if (connStrYet) {
                    graph_new_data(c_buf);
                } else {
                    connString += c_buf;
                    if (connString.indexOf(baudrate.toString(10)) > -1) {
                        connStrYet = true;
                        if (document.getElementById('graph-conn-info')) {
                            document.getElementById('graph-conn-info').innerHTML = connString.trim();
                            // send remainder of string to terminal???  Haven't seen any leak through yet...
                        }
                    } else {
                        graph_new_data(c_buf);
                    }
                }
            };

            $('#graphing-dialog').on('hidden.bs.modal', function () {
                connection.close();
                connString = '';
                connStrYet = false;
                document.getElementById('graph-conn-info').innerHTML = '';
            });

        } else if (client_use_type === 'ws' && ports_available) {
            var msg_to_send = {
                type: 'serial-terminal',
                outTo: 'graph',
                portPath: getComPort(),
                baudrate: baudrate.toString(10),
                msg: 'none',
                action: 'open'
            };

            if (document.getElementById('graph-conn-info')) {
                document.getElementById('graph-conn-info').innerHTML = 'Connection established with ' +
                        msg_to_send.portPath + ' at baudrate ' + msg_to_send.baudrate;
            }

            client_ws_connection.send(JSON.stringify(msg_to_send));

            $('#graphing-dialog').on('hidden.bs.modal', function () {
                if (msg_to_send.action !== 'close') { // because this is getting called multiple times.... ?
                    msg_to_send.action = 'close';
                    if (document.getElementById('graph-conn-info')) {
                        document.getElementById('graph-conn-info').innerHTML = '';
                    }
                    client_ws_connection.send(JSON.stringify(msg_to_send));
                }
            });

        }

        $('#graphing-dialog').modal('show');
}


var check_com_ports = function () {
    if (client_use_type !== 'ws') {
        if (client_url !== undefined) {
            if (client_version >= minVer) {
                // Client is >= minimum supported version
                $.get(client_url + "ports.json", function (data) {
                    set_port_list(data);
                }).fail(function () {
                    set_port_list();
                });
            } else {
                // else keep port list clear (searching...)
                set_port_list();
            }
        }
    }
};

// set communication port list
//   leave data unspecified when searching
var set_port_list = function (data) {
    data = (data ? data : 'searching');
    var selected_port = $("#comPort").val();
    $("#comPort").empty();
    if (typeof (data) === 'object' && data.length) {
        data.forEach(function (port) {
            $("#comPort").append($('<option>', {
                text: port
            }));
        });
        ports_available = true;
    } else {
        $("#comPort").append($('<option>', {
            text: (data === 'searching') ? 'Searching...' : 'No devices found'
        }));
        ports_available = false;
    }
    ;
    select_com_port(selected_port);
};

var select_com_port = function (com_port) {
    if (com_port !== null) {
        $("#comPort").val(com_port);
    }
    if ($("#comPort").val() === null && $('#comPort option').size() > 0) {
        $("#comPort").val($('#comPort option:first').text());
    }
};

$(document).ready(function () {
    check_com_ports();
});

var getComPort = function () {
    return $('#comPort').find(":selected").text();
};

scope_data_bytes = [];

function graph_new_data(stream) {

    // Check for a failed connection:
    if (0 === 1) { //(stream.indexOf('ailed') > -1) {
        $("#graph-conn-info").html('Connection failed!');

    } else {

        for (k = 0; k < stream.length; k++) {
            if (!graph_data_ready && stream[k] === '\n') {
                stream[k] = 13;
            } else if (!graph_data_ready && stream[k] === '\r') {       // come in before graphing, ends up
                graph_data_ready = true;                                // tossing the first point but prevents
		console.log('graph ready!');
            } else {                                                    // garbage from mucking up the graph.
                scope_data_bytes.push(parseInt(stream.charCodeAt(k)));
            }
        }

	if (graph_data_ready) {
            while(scope_data_bytes.length > 4) {

	        if (scope_data_bytes[0] > 127 && scope_data_bytes[1] > 127 && scope_data_bytes[2] > 127 && scope_data_bytes[3] > 127) {
		    graph.update(graph_data);
		    graph_data.series[0] = [];
		    graph_data.series[1] = [];
	        }

		if (scope_data_bytes[0] < 64 && scope_data_bytes[1] < 64) {
		    graph_data.series[0].push(((scope_data_bytes[1] & 0b111111) << 6) | (scope_data_bytes[0] & 0b111111));
	            scope_data_bytes.shift();
	            scope_data_bytes.shift();

		} else if (scope_data_bytes[0] > 63 && scope_data_bytes[1] > 63) {
		    graph_data.series[1].push(((scope_data_bytes[1] & 0b111111) << 6) | (scope_data_bytes[0] & 0b111111));
	            scope_data_bytes.shift();
	            scope_data_bytes.shift();

		} else {
	            scope_data_bytes.shift();

	        }
            }
        }
    }
}

function graph_reset() {
    for (var k = 0; k < 10; k++) {
        graph_data.series[k] = [];
    }
    if (graph) {
        graph.update(graph_data, graph_options, true);
    }
    scope_data_bytes = [];
    graph_data_ready = false;
}
