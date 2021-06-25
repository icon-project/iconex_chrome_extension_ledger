import React, { Component } from "react";
import TransportU2F from "@ledgerhq/hw-transport-u2f";
import Icx from "@ledgerhq/hw-app-icx";
import BigNumber from "bignumber.js";
import "./style/common.css";
import "./style/common-front.css";
import "./style/font.css";
import I18n from "./I18n.js";
import {
  randomUint32,
  generateHashKey,
  objTraverse,
  arrTraverse,
  escapeString,
  convertNumberToText,
  handleCopy
} from "./utils";
import LoadingComponent from "./LoadingComponent";
import CopyButton from "./CopyButton";

let queryString = require("qs");

const UNIT = 5;
const COPY_STATE = {
  off: "",
  on: "복사완료"
};
const POPUP_TYPE = {
  INITIAL: "INITIAL",
  TRANSFER: "TRANSFER",
  VOTING: "VOTING"
};

class App extends Component {
  constructor(props) {
    super(props);
    const message = queryString.parse(window.location.search, {
      ignoreQueryPrefix: true
    });

    this.state = {
      walletLoading: false,
      walletIndex: 0,
      walletList: [],

      popupType: message.popupType,
      lang: message.lang || "kr",
      i18n: I18n[message.lang || "kr"],
      copyState: COPY_STATE["off"],
      copyIndex: -1,
      error: ""
    };

    switch (message.method) {
      case "getBalance":
        this.checkError(() => {
          this.moveWalletList(0);
        });
        break;
      case "sendTransaction":
        const param = {
          ...message
        };
        this.checkError(() => {
          this.signTransaction(message.path, param);
        });
        break;
      default:
        break;
    }
  }

  checkError = async callback => {
    try {
      this.setState({ walletLoading: true });
      const transport = await TransportU2F.create();
      transport.setDebugMode(false);
      const icx = new Icx(transport);
      const path = `44'/4801368'/0'/0'/${0}'`;
      const { address } = await icx.getAddress(path, false, true);
      callback();
    } catch (error) {
      window.parent.postMessage(JSON.stringify({ error }), "*");
    }
  };

  getAddress = async (index, callback) => {
    try {
      this.setState({ walletLoading: true });
      const transport = await TransportU2F.create();
      transport.setDebugMode(false);
      const icx = new Icx(transport);
      let walletList = [],
        paramArr = [],
        balanceArr = [];

      for (let i = index * UNIT; i < index * UNIT + UNIT; i++) {
        const path = `44'/4801368'/0'/0'/${i}'`;
        const { address } = await icx.getAddress(path, false, true);
        const _address = address.toString();
        walletList.push({
          path,
          account: _address
        });
        paramArr.push(_address);
      }
      balanceArr = await getBalance(paramArr);
      walletList = walletList.map((wallet, i) => {
        return {
          ...wallet,
          balance: balanceArr[i].balance,
          isStakedValueNone: balanceArr[i].isStakedValueNone
        };
      });
      this.setState({ walletList, walletLoading: false }, callback);
    } catch (error) {
      window.parent.postMessage(JSON.stringify({ error }), "*");
    }
  };

  moveWalletList = index => {
    this.getAddress(index, () => {
      this.setState({ walletIndex: index });
    });
  };

  signTransaction = async (path, param) => {
    try {
      let result = {};
      const rawTx = { ...param };
      const isV3 = rawTx.networkVer === "v3";
      delete rawTx.lang;
      delete rawTx.method;
      delete rawTx.path;
      delete rawTx.networkVer;
      delete rawTx.popupType;

      const phraseToSign = generateHashKey(rawTx);
      const transport = await TransportU2F.create();
      const icx = new Icx(transport);
      const signedData = await icx.signTransaction(path, phraseToSign);
      const { signedRawTxBase64, hashHex } = signedData;
      rawTx["signature"] = signedRawTxBase64;

      if (!isV3) {
        rawTx["tx_hash"] = hashHex;
      }

      result = {
        method: "setRawTx",
        payload: {
          ...rawTx
        }
      };

      window.parent.postMessage(JSON.stringify(result), "*");
    } catch (error) {
      window.parent.postMessage(JSON.stringify({ error }), "*");
    } finally {
    }
  };

  sendTransactionErrorHandler = event => {
    const { data, source } = event;
    const parsedData = JSON.parse(data);
    const { method } = parsedData;

    switch (method) {
      case "closeLedger":
        throw new Error(method);
        break;
      default:
        break;
    }
  };

  openAccountInfoOnTracker = async wallet => {
    const param = {
      method: "openAccountInfoOnTracker",
      payload: wallet.account
    };
    window.parent.postMessage(JSON.stringify(param), "*");
  };

  setSelectedAccount = async (wallet, action) => {
    if (wallet.balance === "0" && wallet.isStakedValueNone) {
      window.parent.postMessage(
        JSON.stringify({
          method: "setBalanceError"
        }),
        "*"
      );
      return;
    }
    const param = {
      method: "setWallet",
      action,
      payload: {
        ...wallet,
        tokens: {},
        type: "icx"
      }
    };
    window.parent.postMessage(JSON.stringify(param), "*");
  };

  handleCopy = (e, index) => {
    e.stopPropagation();
    const { copyState } = this.state;
    handleCopy(
      `span.copyKey${index}`,
      index,
      copyState,
      this.setState.bind(this)
    );
  };

  render() {
    const {
      walletLoading,
      walletIndex,
      walletList,
      popupType,
      i18n,
      lang,
      copyState,
      copyIndex,
      error
    } = this.state;
    const startIndex = walletIndex * UNIT;

    return (
      <div className="popup-wrap">
        <div
          className="popup address wallet"
          style={{
            // width: 1160,
            // height: 568,
            height: 400,
            width: 1060,
            padding: 0
          }}
        >
          <div className="scroll-holder">
            <div className="tabbox-holder">
              <div className="box">
                <div className="scroll autoH">
                  <table className="table-typeF">
                    <thead>
                      <tr>
                        <th>{i18n.table1}</th>
                        <th>{i18n.table2}</th>
                        <th>{i18n.table3}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody></tbody>
                  </table>
                </div>
                <div className="table-holder scroll" style={{ height: 252 }}>
                  {!walletLoading ? (
                    <table className="table-typeF">
                      <thead>
                        <tr>
                          <th>{i18n.table1}</th>
                          <th>{i18n.table2}</th>
                          <th>{i18n.table3}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {walletList.map((wallet, index) => (
                          <tr key={index}>
                            <td>{startIndex + index + 1}</td>
                            <td>
                              <p
                                className={`link ${
                                  copyIndex === index ? "complete" : ""
                                }`}
                                onClick={e => this.handleCopy(e, index)}
                              >
                                <span className={`ellipsis copyKey${index}`}>
                                  {wallet.account}
                                </span>
                                {copyState === COPY_STATE["on"] ? (
                                  <em>{i18n.button.copyFinish}</em>
                                ) : (
                                  <em>{i18n.button.copyDepositAddress}</em>
                                )}
                              </p>
                            </td>
                            <td>
                              {`${convertNumberToText(wallet.balance)}`} ICX
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                onClick={() =>
                                  this.openAccountInfoOnTracker(wallet)
                                }
                                className="btn-type-link"
                              >
                                <span>{i18n.button.tracker}</span>
                              </button>
                              {(popupType === POPUP_TYPE.INITIAL ||
                                popupType === POPUP_TYPE.TRANSFER) && (
                                <button
                                  onClick={() =>
                                    this.setSelectedAccount(
                                      wallet,
                                      POPUP_TYPE.TRANSFER
                                    )
                                  }
                                  className="btn-type-exchange"
                                >
                                  <span>{i18n.button.transfer}</span>
                                </button>
                              )}
                              {(popupType === POPUP_TYPE.INITIAL ||
                                popupType === POPUP_TYPE.VOTING) && (
                                <button
                                  onClick={() =>
                                    this.setSelectedAccount(
                                      wallet,
                                      POPUP_TYPE.VOTING
                                    )
                                  }
                                  className="btn-type-exchange"
                                >
                                  <span>{i18n.button.vote}</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="table-typeF">
                      <thead>
                        <tr>
                          <th>{i18n.table1}</th>
                          <th>{i18n.table2}</th>
                          <th>{i18n.table3}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="main">
                          <td style={{ height: 252 }} colSpan="5">
                            <LoadingComponent type="black" />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              <Pagination
                disable={walletLoading}
                page={walletIndex + 1}
                changePage={i => this.moveWalletList(i - 1)}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
}

class Pagination extends Component {
  render() {
    const { page, changePage, disable } = this.props;
    const pagination = () => {
      const pageNum = [];
      let initNum, maxNum;
      initNum = page - 1 < 2 ? 1 : page - 2;
      maxNum = initNum + 4;

      for (let i = initNum; i <= maxNum; i++) {
        pageNum.push({
          num: i
        });
      }

      return (
        <div className="pager-holder">
          <ul className="">
            <li className="controller">
              <a
                className={`prev start ${page === 1 && "disabled"}`}
                onClick={() => {
                  if (!disable && page !== 1) changePage(1);
                }}
              >
                <em className="_img"></em>
              </a>
            </li>
            &nbsp;
            <li className="controller">
              <a
                className={`prev start2 ${page === 1 && "disabled"}`}
                onClick={() => {
                  if (!disable && page - 1 >= 1) changePage(page - 1);
                }}
              >
                <em className="_img"></em>
              </a>
            </li>
            {pageNum.map(btn => {
              return (
                <li
                  className={`${btn.disabled && "disabled"} ${page ===
                    btn.num && "selected"}`}
                  key={btn.num}
                >
                  <a
                    className="number"
                    onClick={() => {
                      if (!disable && !btn.disabled && page !== btn.num)
                        changePage(btn.num);
                    }}
                  >
                    {btn.num}
                  </a>
                </li>
              );
            })}
            <li className="controller">
              <a
                className={`next end`}
                onClick={() => {
                  if (!disable) changePage(page + 1);
                }}
              >
                <em className="_img"></em>
              </a>
            </li>
            &nbsp;
            <li className="controller">
              <a
                className={`next end2`}
                onClick={() => {
                  if (!disable) changePage(page + 5);
                }}
              >
                <em className="_img"></em>
              </a>
            </li>
          </ul>
        </div>
      );
    };

    return pagination();
  }
}

function getBalance(inputArr) {
  return new Promise(resolve => {
    window.parent.postMessage(
      JSON.stringify({
        method: "icx_getBalance",
        payload: inputArr
      }),
      "*"
    );

    window.addEventListener("message", getBalanceEventHandler);

    function getBalanceEventHandler(event) {
      window.removeEventListener("message", getBalanceEventHandler);
      resolve(event.data);
    }
  });
}

export default App;

