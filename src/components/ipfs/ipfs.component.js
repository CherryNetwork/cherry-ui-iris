import React from "react";
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { saveAs } from 'file-saver';
import { create } from 'ipfs-http-client';

import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

import StorageAssetView from "../storage-asset/storage-asset.component";
import LibraryView from "../library/library.component";

import ClipLoader from "react-spinners/ClipLoader";

import './ipfs.component.css';

// js-ipfs config options documented here:
// https://hub.docker.com/r/ipfs/js-ipfs/
class IpfsComponent extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      isConnected: false,
      isRunning: false,
      default_account: null,
      account: null,
      api: null,
      ipfs: null,
      fileData: '',
      newCIDEvents: [],
      ipfsItems: [],
      connectionAliveTime: 0,
      eventLogs: [],
      yourAssetClasses: [],
      yourAssets: [],
      ticketAmount: 1,
      selected_asset_class_cid: '',
      mint_balance: 1,
      selectedToggle: 'StorageAssetView',
    }
    this.captureEventLogs = this.captureEventLogs.bind(this);
    this.updateElapsedTime = this.updateElapsedTime.bind(this);
    // this.mint_tickets = this.mint_tickets.bind(this);
    this.requestData = this.requestData.bind(this);
    this.retrieveBytes = this.retrieveBytes.bind(this);
    // event handlers
    // this.handleFileDataChange = this.handleFileDataChange.bind(this);
    // this.handleAddToIpfsClick = this.handleAddToIpfsClick.bind(this);
    // this.handleFileSubmit = this.handleFileSubmit.bind(this);
    // this.handleDownload = this.handleDownload.bind(this);
  }

  async componentDidMount() {
    if (this.state.api === null) {
      if (this.state.ipfs === null) {
        const ipfs = await create({
          host: 'localhost',
          port: 5001,
          protocol: 'http',
        });
        this.setState({ ipfs: ipfs });
      }

      const host = this.props.host;
      const port = this.props.port;

      const provider = new WsProvider(`ws://${host}:${port}`);
      const api = await ApiPromise.create({
        provider,
        types: {
          DataCommand: '_DataCommand',
        },
        rpc: {
          iris: {
            retrieveBytes: {
              description: 'retrieve bytes from iris',
              params: [
                {
                  name: 'public_key',
                  type: 'Bytes'
                },
                {
                  name: 'signature',
                  type: 'Bytes'
                },
                {
                  name: 'message',
                  type: 'Bytes'
                }
              ],
              type: 'Bytes'
            }
          }
        }
      });
      await api.isReady;
      setInterval(() => { this.updateElapsedTime(1000) }, 1000);
      this.setState({ isConnected: true });
      const keyring = new Keyring({ type: 'sr25519' });
      const account = keyring.addFromUri('//' + this.props.address);
      this.setState({ api: api, default_account: account });

    }
  }

  clearEventLogs() {
    this.setState({ eventsLogs: [] });
  }

  updateElapsedTime(t) {
    const updateAliveTime = this.state.connectionAliveTime + t;
    this.setState({ connectionAliveTime: updateAliveTime })
  }

  addToEventLog(message) {
    const newEventLogs = this.state.eventLogs.concat(message);
    this.setState({ eventLogs: newEventLogs });
  }

  clearEventLog() {
    this.setState({ eventLogs: [] });
  }

  getAccount() {
    return this.state.account === null ? this.state.default_account : this.state.account;
  }

  async requestData(owner, cid) {
    await this.state.api.tx.iris
      .requestData(owner, cid)
      .signAndSend(this.getAccount(), this.captureEventLogs)
      .then(res => this.updateStorage())
      .catch(err => {
        console.log(err);
      });
  }

  async retrieveBytes(publicKey, signature, message) {
    let res = await this.state.api.rpc.iris.retrieveBytes(publicKey, signature, message);
    this.download(res, message);
  }

  /*
    Event Handlers
  */
  handleEmittedEvents() {
    this.state.api.query.system.events((events) => {
      events.forEach(record => {
        const { event, } = record;
        const eventData = event.data;

        const fileContent = this.hexToAscii(String(eventData[0]).substr(2));
        const filename = this.hexToAscii(String(eventData[1]).substr(2));
        this.download(fileContent, filename);

      });
    });
  }

  captureEventLogs(e) {
    const status = e.status;
    const events = e.events;
    if (status.isInBlock) {
      this.addToEventLog(`included in ${status.asInBlock}`);
    }
    if (events !== undefined && (status.isInBlock || status.isFinalized)) {
      events.forEach((record) => {
        const { event, phase } = record;
        const types = event.typeDef;
        this.addToEventLog(`\t${event.section}:${event.method}:: (phase=${phase.toString()})`);
        if (event.data !== undefined) {
          event.data.forEach((data, index) => {
            if (data !== undefined) {
              this.addToEventLog(`\t\t\t${types[index].type}: ${data.toString()}`);
            }
          });
        }
      })
    }
  }

  // captureFile(e) {
  //   e.stopPropagation();
  //   e.preventDefault();
  //   const file = e.target.files[0];
  //   let reader = new FileReader();
  //   reader.onloadend = async () => {
  //     const resultString = this.arrayBufferToString(reader.result);
  //     await this.addBytes(resultString, file.name, file.size);
  //   };
  //   reader.readAsArrayBuffer(file);
  // }

  download(file, filename) {
    const mime = require('mime-types');
    const type = mime.lookup(filename);
    const blob = new Blob([file], { type: type });
    saveAs(blob, filename);
  }

  // arrayBufferToString = (arrayBuffer) => {
  //   return new TextDecoder("utf-8").decode(new Uint8Array(arrayBuffer));
  // }

  hexToAscii(str1) {
    var hex = str1.toString();
    var str = '';
    for (var n = 0; n < hex.length; n += 2) {
      str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
    }
    return str;
  }

  msToTime(duration) {
    var milliseconds = parseInt((duration % 1000) / 100),
      seconds = Math.floor((duration / 1000) % 60),
      minutes = Math.floor((duration / (1000 * 60)) % 60),
      hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    seconds = (seconds < 10) ? "0" + seconds : seconds;

    return hours + ":" + minutes + ":" + seconds + "." + milliseconds;
  }

  /*
    User Input Event handlers
  */
  handleFileDataChange(e) {
    e.preventDefault();
    this.setState({ fileData: e.target.value });
  }

  // handleAddToIpfsClick(e) {
  //   e.preventDefault();
  //   this.addBytes(this.state.api, this.state.fileData);
  // }

  handleDownload(cid) {
    this.catBytes(cid);
  }

  handleFileSubmit(e) {
    e.preventDefault();
  }

  handleFindProviders(cid) {
    this.getProviders(cid);
  }

  handleSelectStorageAsset(cid) {
    this.setState({ selected_asset_class_cid: cid });
  }

  updateToggle(value) {
    this.setState({ selectedToggle: value });
    // this.forceUpdate();
  }

  /*
    DOM elements
  */

  eventLogs_container() {
    return (
      <div className="event-log_container">
        <span className="event-logs-header">
          Event Logs
        </span>
        <button onClick={this.clearEventLog.bind(this)}>
          Clear
        </button>
        <div className="event-log-item-container">
          {this.state.eventLogs.map((line, idx) => {
            return <span key={idx}>
              {idx} : {line}
            </span>
          })}
        </div>
      </div>
    );
  }

  render() {
    return (
      <div className="ipfs-container">
        <div className="sidebar">
          <div className="sidebar-item" onClick={() => this.updateToggle('StorageAssetView')}>
            Storage Assets <InsertDriveFileIcon />
          </div>
          <div className="sidebar-item" onClick={() => this.updateToggle('LibraryView')}>
            Library <LibraryBooksIcon />
          </div>
        </div>
        <div className="content-container">
          {this.state.isConnected === false ?
            <div className="loader-container">
              <ClipLoader loading={!this.state.isConnected} size={150} />
            </div> :
            <div className="top-level-container">
              <div className="container">
                <div className="session-info-container">
                  {this.state.default_account === null ? '' : this.getAccount().address}
                  <span
                    className="dot active">
                  </span>
                  Connected
                  {this.msToTime(this.state.connectionAliveTime)}
                </div>
                {this.eventLogs_container()}
              </div>
            </div>}
          <div className="assets-container">
            <div className="assets-view-container">
              {this.state.selectedToggle === 'StorageAssetView' ?
                <StorageAssetView
                  account={this.getAccount()}
                  storageAssetClasses={this.state.yourAssetClasses}
                  mint={this.mint_tickets}
                  api={this.state.api}
                  ipfs={this.state.ipfs}
                /> :
                <LibraryView
                  account={this.getAccount()}
                  library={this.state.yourAssets}
                  requestData={this.requestData}
                  retrieveBytes={this.retrieveBytes}
                  api={this.state.api}
                />
              }
            </div>
          </div>
        </div>
      </div>
    );
  }

}

export default IpfsComponent;
