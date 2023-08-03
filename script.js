const client_id =
"AecNl_qaDuLKXRGAviRbvQ5773SJLW15PrxuOShudJbS3QCaBH8tTX6Wi1mJ8aByWaQx2FeRIVZ7KCg0";
const secret_key =
"EFuRYH2pDANYlrpybQulVCq6sc706zEw37ffiMKvpw4vzPJEpNk9NeORWS4l4rMtAbzLWqssRb_ny_Mj";

// const client_id =
//     "AZKhxEQXmqa55rEt7Oa-sYX57JBVwMIHXf0Mo5-9HIqH33IK8QlbZRmafaTB45htQh4iEO_yTFXCySz_";
// const secret_key =
//     "EJWU_h3jhQf4_ITipl1U7qbv5bRcRKK5x7QpHpT7_49VI0_BenOtdkjY5NRapo8D7g_PtZWqfsiBA5b7";

/*
 * Define the version of the Google Pay API referenced when creating your
 * configuration
 */
const baseRequest = {
    apiVersion: 2,
    apiVersionMinor: 0,
};
let paymentsClient = null,
    allowedPaymentMethods = null,
    merchantInfo = null;
/* Configure your site's support for payment methods supported by the Google Pay */
function getGoogleIsReadyToPayRequest(allowedPaymentMethods) {
    return Object.assign({}, baseRequest, {
        allowedPaymentMethods: allowedPaymentMethods,
    });
}
/* Fetch Default Config from PayPal via PayPal SDK */
async function getGooglePayConfig() {
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
async function getGooglePaymentDataRequest() {
    const paymentDataRequest = Object.assign({}, baseRequest);
    const { allowedPaymentMethods, merchantInfo } = await getGooglePayConfig();
    paymentDataRequest.allowedPaymentMethods = allowedPaymentMethods;
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
function getGooglePaymentsClient() {
    if (paymentsClient === null) {
        paymentsClient = new google.payments.api.PaymentsClient({
            environment: "TEST",
            paymentDataCallbacks: {
                onPaymentAuthorized: onPaymentAuthorized,
            },
        });
    }
    return paymentsClient;
}
async function onGooglePayLoaded() {
    const paymentsClient = getGooglePaymentsClient();
    const { allowedPaymentMethods } = await getGooglePayConfig();
    paymentsClient
        .isReadyToPay(getGoogleIsReadyToPayRequest(allowedPaymentMethods))
        .then(function (response) {
            if (response.result) {
                addGooglePayButton();
            }
        })
        .catch(function (err) {
            console.error(err);
        });
}
function addGooglePayButton() {
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
async function onGooglePaymentButtonClicked() {
    const paymentDataRequest = await getGooglePaymentDataRequest();
    paymentDataRequest.transactionInfo = getGoogleTransactionInfo();
    const paymentsClient = getGooglePaymentsClient();
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
        if (status === "APPROVED") {
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
