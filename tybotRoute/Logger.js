let { Publisher } = require("@tiledesk/tiledesk-multi-worker");

const AMQP_MANAGER_URL = process.env.AMQP_MANAGER_URL;
let publisher = new Publisher(AMQP_MANAGER_URL, {
    debug: true,
    queueName: "logs_queue",
    exchange: "tiledesk-multi",
    topic: "logs",
})
console.log("*** publisher: ", publisher)

class Logger {

    constructor(config) {

        if (!config) {
            throw new Error('config is mandatory');
        }

        if (!config.request_id) {
            console.error('config.request_id is mandatory');
            //throw new Error('config.request_id is mandatory');
        }

        console.log("config.request_id: ", config.request_id);
        this.request_id = config.request_id;
        this.dev = config.dev;

        if (!AMQP_MANAGER_URL) {
            console.error('AMQP_MANAGER_URL is undefined. Logger not available...');
            return;
            //throw new Error("Error starting logger: AMQP_MANAGER_URL is undefined.")
        }

    }

    error(text) {
        if (!this.request_id || !publisher) {
            console.log("this.request_id: ", this.request_id);
            console.log("publisher: ", publisher);
            console.log("Return");
            return;
        }

        console.log("adding error log: ", text)
        let data = {
            request_id: this.request_id,
            text: text,
            level: "error"
        }
        publisher.publish(data, (err, ok) => {
            if (err) console.warn("publish log fail: ", err);
            return;
        })
    }

    info(text) {
        console.log("config.request_id: ", this.request_id);
        if (!this.request_id || !publisher) {
            console.log("this.request_id: ", this.request_id);
            console.log("publisher: ", publisher);
            console.log("Return");
            return;
        }

        console.log("adding info log: ", text)
        let data = {
            request_id: this.request_id,
            text: text,
            level: "info"
        }

        console.log("publishing data text: ", data.text);
        publisher.publish(data, (err, ok) => {
            if (err) console.warn("publish log fail: ", err);
            console.log("published data text: ", data.text);
            return;
        })
    }

}

module.exports = { Logger }