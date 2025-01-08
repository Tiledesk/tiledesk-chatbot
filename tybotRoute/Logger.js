let JobManager = require("@tiledesk/tiledesk-multi-worker");

class Logger {

    constructor(config) {

        if (!config) {
            throw new Error('config is mandatory');
        }

        if (!config.request_id) {
            throw new Error('config.request_id is mandatory');
        }

        this.dev = config.dev;

        this.AMQP_MANAGER_URL = process.env.AMQP_MANAGER_URL;
        if (!this.AMQP_MANAGER_URL) {
            throw new Error("Error starting logger: AMQP_MANAGER_URL is undefined.")
        }

        this.jobManager = new JobManager(this.AMQP_MANAGER_URL, {
            debug: false,
            queueName: "logs_queue",
            exchange: "tiledesk-multi",
            topic: "logs",
        })

        jobManager.connectAndStartPublisher((status, error) => {
            if (error) {
                console.error("connectAndStartPublisher error: ", error)
                throw new Error("Error starting logger");
            } else {
                console.log("Logger Started. Status ", status);
            }
        })
    }

    error(text) {
        let data = {
            request_id: request,
            text: text,
            level: "error"
        }
        this.jobManager.publish(data, (err, ok) => {
            let response_data = { success: true, message: "Scheduled" };
            if (callback) {
                callback(err, response_data);
            }
        })
    }

    info(text, request) {
        let data = {
            request_id: request,
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