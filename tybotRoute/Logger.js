let { Publisher } = require("@tiledesk/tiledesk-multi-worker");

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

        this.AMQP_MANAGER_URL = process.env.AMQP_MANAGER_URL;
        if (!this.AMQP_MANAGER_URL) {
            console.error('AMQP_MANAGER_URL is undefined. Logger not available...');
            return;
            //throw new Error("Error starting logger: AMQP_MANAGER_URL is undefined.")
        }

        this.jobManager = new Publisher(this.AMQP_MANAGER_URL, {
            debug: true,
            queueName: "logs_queue",
            exchange: "tiledesk-multi",
            topic: "logs",
        })

        console.log("jobManager")
        this.jobManager.connectAndStartPublisher((status, error) => {
            console.log("jobManager connectAndStartPublisher")
            if (error) {
                console.error("connectAndStartPublisher error: ", error)
                console.error("Logger not available...');")
                //throw new Error("Error starting logger");
            } else {
                console.log("Logger Started. Status ", status);
            }
        })
    }

    error(text) {
        if (!this.request_id || !this.jobManager) {
            console.log("this.request_id: ", this.request_id);
            console.log("this.jobManager: ", this.jobManager);
            console.log("Return");
            return;
        }

        console.log("adding error log: ", text)
        let data = {
            request_id: this.request_id,
            text: text,
            level: "error"
        }
        this.jobManager.publish(data, (err, ok) => {
            let response_data = { success: true, message: "Scheduled" };
            if (callback) {
                callback(err, response_data);
                return;
            }
            return;
        })
    }

    info(text) {
        console.log("config.request_id: ", this.request_id);
        if (!this.request_id || !this.jobManager) {
            console.log("this.request_id: ", this.request_id);
            console.log("this.jobManager: ", this.jobManager);
            console.log("Return");
            return;
        }

        console.log("adding info log: ", text)
        let data = {
            request_id: this.request_id,
            text: text,
            level: "info"
        }
        this.jobManager.publish(data, (err, ok) => {
            let response_data = { success: true, message: "Scheduled" };
            if (callback) {
                callback(err, response_data);
            }
        })
    }
    
}

module.exports = { Logger }