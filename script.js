
/*
 * Define the version of the Google Pay API referenced when creating your configuration
 * 指定Google Pay 版本, 是必须的
 */
const baseRequest = {
    apiVersion: 2,
    apiVersionMinor: 0,
};


let paymentsClient = null,
    allowedPaymentMethods = null,
    //merchantInfo需要包含merchantName和merchantID
    //不过这里不是很关键, 因为在使用PayPal OrderV2的时候传了merchant参数
    merchantInfo = null;


/* Configure your site's support for payment methods supported by the Google Pay */
// 参考Google Pay dev doc第6步
function getGoogleIsReadyToPayRequest(allowedPaymentMethods) {
    console.log("[5](getGoogleIsReadyToPayRequest): wrap a request object for isReadyToPay. 对象合并以提供一个符合规范的对象")
    return Object.assign({}, baseRequest, {
        allowedPaymentMethods: allowedPaymentMethods,
    });
}

/* Fetch Default Config from PayPal via PayPal SDK */
// 参考Google Pay dev doc第6步
async function getGooglePayConfig() {
    console.log("[3](getGooglePayConfig): Get isReadyToPay Object!确定是否能使用GooglePay进行付款")
    if (allowedPaymentMethods == null || merchantInfo == null) {
        const googlePayConfig = await paypal.Googlepay().config();
        allowedPaymentMethods = googlePayConfig.allowedPaymentMethods;
        merchantInfo = googlePayConfig.merchantInfo;
    }
    return {
        allowedPaymentMethods,
        merchantInfo,
    };
}
/* Configure support for the Google Pay API */
// 参考google pay dev第8步
async function getGooglePaymentDataRequest() {
    //构建一个JS对象来说明当前网站对Google Pay API的支持情况
    const paymentDataRequest = Object.assign({}, baseRequest);
    //添加当前应用的付款方式, 在这里就是PayPal
    const { allowedPaymentMethods, merchantInfo } = await getGooglePayConfig();
    paymentDataRequest.allowedPaymentMethods = allowedPaymentMethods;
    //添加测试的交易信息
    paymentDataRequest.transactionInfo = getGoogleTransactionInfo();
    paymentDataRequest.merchantInfo = merchantInfo;
    paymentDataRequest.callbackIntents = ["PAYMENT_AUTHORIZATION"];
    return paymentDataRequest;
}


function onPaymentAuthorized(paymentData) {
    return new Promise(function (resolve, reject) {
        processPayment(paymentData)
            .then(function (data) {
                resolve({ transactionState: "SUCCESS" });
            })
            .catch(function (errDetails) {
                resolve({ transactionState: "ERROR" });
            });
    });
}

//初始化paymentClient  参照Google Pay Dev第五步
function getGooglePaymentsClient() {
    console.log("[2](getGooglePaymentsClient): Google Pay Client is initialize!")
    if (paymentsClient === null) {
        paymentsClient = new google.payments.api.PaymentsClient({
            environment: "TEST",
            paymentDataCallbacks: {
                //注册: 在买家授权之后
                onPaymentAuthorized: onPaymentAuthorized,
            },
        });
    }
    return paymentsClient;
}

// 主要方法, 当来自Google的脚本加载后做的事情
async function onGooglePayLoaded() {   

    console.log("[1](onGooglePayLoaded): Google Pay Script is loaded!")
    const paymentsClient = getGooglePaymentsClient();
    const { allowedPaymentMethods } = await getGooglePayConfig();
    console.log("[4](onGooglePayLoaded): execute isReadyToPay() function")
    paymentsClient
        .isReadyToPay(getGoogleIsReadyToPayRequest(allowedPaymentMethods))
        .then(function (response) {
            if (response.result) {
                console.log("[6](onGooglePayLoaded.isReadyToPay): Congratulation! Google Pay is support!")
                addGooglePayButton();
            }
        })
        .catch(function (err) {
            console.error(err);
        });
}

// Add button after everything goes well
function addGooglePayButton() {
    console.log("[7](addGooglePayButton): Add Google Pay Button.")
    const paymentsClient = getGooglePaymentsClient();
    const button = paymentsClient.createButton({
        onClick: onGooglePaymentButtonClicked,
    });
    document.getElementById("button-container").appendChild(button);
}


function getGoogleTransactionInfo() {
    return {
        displayItems: [
            {
                label: "Subtotal",
                type: "SUBTOTAL",
                price: "100.00",
            },
            {
                label: "Tax",
                type: "TAX",
                price: "10.00",
            },
        ],
        countryCode: "US",
        currencyCode: "USD",
        totalPriceStatus: "FINAL",
        totalPrice: "110.00",
        totalPriceLabel: "Total",
    };
}

// click事件的handler
async function onGooglePaymentButtonClicked() {
    console.log("[8](onGooglePaymentButtonClicked): Google Pay Button is Clicked!.")
    const paymentDataRequest = await getGooglePaymentDataRequest();
    paymentDataRequest.transactionInfo = getGoogleTransactionInfo();
    const paymentsClient = getGooglePaymentsClient();
    //TODO 第10步
    paymentsClient.loadPaymentData(paymentDataRequest);
}


async function processPayment(paymentData) {
    try {
        const { currencyCode, totalPrice } = getGoogleTransactionInfo();
        const order = {
            intent: "CAPTURE",
            purchase_units: [
                {
                    amount: {
                        currency_code: currencyCode,
                        value: totalPrice,
                    },
                    payee: {
                        merchant_id: "CMHAMMNAXCMGA",
                    },
                },
            ],
        };
        const accessToken = await generateAccessToken();
        // console.log(accessToken)
        /* Create Order */
        const { id } = await fetch(
            "https://api.sandbox.paypal.com/v2/checkout/orders",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(order),
            }
        ).then((res) => res.json());

        console.log("PayPal order id:", id);
        // debugger;
        const { status } = await paypal.Googlepay().confirmOrder({
            orderId: id,
            paymentMethodData: paymentData.paymentMethodData,
        });
        console.log("Status: google pay confirm order:", status);
        if(status === "PAYER_ACTION_REQUIRED"){
            console.log("==== Confirm Payment Completed Payer Action Required =====");
            paypal
              .Googlepay()
              .intiatePayerAction({ orderId: id })
              .then(async () => {
                console.log("===== Payer Action Completed =====");
                /** GET Order */
                const orderResponse = await fetch(`/orders/${id}`, {
                  method: "GET",
                }).then((res) => res.json());
                console.log("===== 3DS Contingency Result Fetched =====");
                console.log(
                  orderResponse?.payment_source?.google_pay?.card?.authentication_result
                );
                /* CAPTURE THE ORDER*/
                const captureResponse = await fetch(`/orders/${id}/capture`, {
                  method: "POST",
                }).then((res) => res.json());
                console.log(" ===== Order Capture Completed ===== ");
              });
        } else if (status === "APPROVED") {
            /* Capture the Order */
            const captureResponse = await fetch(
                `https://api.sandbox.paypal.com/v2/checkout/orders/${id}/capture`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            ).then((res) => res.json());
            console.log("Success!")
            return { transactionState: "SUCCESS" };
        } else {
            return { transactionState: "ERROR" };
        }

        
    } catch (err) {
        return {
            transactionState: "ERROR",
            error: {
                message: err.message,
            },
        };
    }
}

async function generateAccessToken() {
    const url = "https://api.sandbox.paypal.com/v1/oauth2/token";

    let accessToken = btoa(`${client_id}:${secret_key}`);

    let params = {
        grant_type: "client_credentials",
    };
    let formData = new URLSearchParams(params);

    // fetch(url, {
    //     method: "POST",
    //     headers: {
    //         "Content-Type": "application/x-www-form-urlencoded",
    //         Authorization: `Basic ${accessToken}`,
    //     },
    //     body: formData,
    // }).then((response) => {
    //     let jsonResponse = response.json()
    //     console.log(jsonResponse)
    //     return jsonResponse;
    // });

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${accessToken}`,
        },
        body: formData,
    });
    const data = await response.json();
    // console.log(data)
    console.log(data.access_token);
    return data.access_token;
}
