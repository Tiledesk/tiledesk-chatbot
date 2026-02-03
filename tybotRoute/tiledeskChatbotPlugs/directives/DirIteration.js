const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { DirIntent } = require('./DirIntent');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');

class DirIteration {
  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    
    this.context = context;
    this.reply = context.reply;
    this.message = context.message;
    this.chatbot = context.chatbot;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    
    this.intentDir = new DirIntent(context);
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    winston.verbose("Execute Iteration directive");
    console.log("directive: ", directive);
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirIteration Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Iteration] Executed");
      callback(stop);
    });
  }

  async go(action, callback) {
    winston.debug("(DirIteration) Action: ", action);
    
    let actionId = action["_tdActionId"];
    let iterationState = null;
    let foundActionId = actionId;

    // Check if there's an active iteration state
    if (actionId) {
      iterationState = await this.#getIterationState(actionId);
      foundActionId = actionId;
    }

    // If no state found and no actionId, try to find any active iteration for this request
    // (fallback for cases where actionId might not be available in subsequent calls)
    if (!iterationState && !actionId) {
      foundActionId = await this.#findActiveIterationActionId();
      if (foundActionId) {
        iterationState = await this.#getIterationState(foundActionId);
      }
    }
    
    if (!iterationState) {
      // First call: initialize iteration state
      if (!actionId) {
        this.logger.error("[Iteration] Cannot initialize iteration: actionId is required");
        winston.error("[Iteration] Cannot initialize iteration: actionId is required");
        callback(true);
        return;
      }
      await this.#initializeIteration(action, actionId, callback);
    } else {
      // Subsequent call: continue iteration
      // Use values from saved state, not from action (which may not be available)
      await this.#continueIteration(iterationState, foundActionId, callback);
    }
  }

  async #initializeIteration(action, actionId, callback) {
    winston.debug("[Iteration] Initializing iteration state");
    console.log("[Iteration] Initializing iteration state");
    
    const iterable = action.iterable;
    const goToIntent = action.goToIntent;
    const output = action.assignOutputTo;
    const delay = 1000;
    //const delay = (action.delay || 30) * 1000; // s to ms

    // Get iterable array
    const iterableArray = await TiledeskChatbot.getParameterStatic(this.tdcache, this.requestId, iterable);

    if (!iterableArray) {
      winston.verbose("[Iteration] Iterable object is undefined");
      console.log("[Iteration] Iterable object is undefined");
      this.logger.warn("[Iteration] Iterable object is undefined");
      callback(true);
      return;
    }

    if (!Array.isArray(iterableArray)) {
      winston.verbose("[Iteration] A non-iterable object was provided. Exit...")
      console.log("[Iteration] A non-iterable object was provided. Exit...")
      this.logger.error("[Iteration] A non-iterable object was provided. Exit...")
      callback(true);
      return;
    }

    if (iterableArray.length === 0) {
      winston.verbose("[Iteration] Iterable array is empty. Exit...")
      console.log("[Iteration] Iterable array is empty. Exit...")
      this.logger.warn("[Iteration] Iterable array is empty. Exit...")
      callback(true);
      return;
    }

    // Save iteration state
    const iterationState = {
      currentIndex: 0,
      iterableArray: iterableArray,
      goToIntent: goToIntent,
      output: output,
      delay: delay,
      totalItems: iterableArray.length
    };
    
    await this.#saveIterationState(actionId, iterationState);
    this.logger.native(`[Iteration] Initialized iteration with ${iterableArray.length} items`);
    console.log(`[Iteration] Initialized iteration with ${iterableArray.length} items`);

    // Process first item
    await this.#processCurrentItem(iterationState, actionId, goToIntent, output, callback);
  }

  async #continueIteration(iterationState, actionId, callback) {
    winston.debug(`[Iteration] Continuing iteration from index ${iterationState.currentIndex}`);
    console.log(`[Iteration] Continuing iteration from index ${iterationState.currentIndex}`);
    
    // Increment index
    iterationState.currentIndex += 1;

    // Check if iteration is complete
    if (iterationState.currentIndex >= iterationState.totalItems) {
      this.logger.native("[Iteration] Iteration completed");
      await this.#clearIterationState(actionId);
      console.log("[Iteration] Iteration completed");
      callback(true);
      return;
    }

    // Update state with new index
    await this.#saveIterationState(actionId, iterationState);
    
    // Process current item (use values from saved state)
    await this.#processCurrentItem(iterationState, actionId, iterationState.goToIntent, iterationState.output, callback);
  }

  async #processCurrentItem(iterationState, actionId, goToIntent, output, callback) {
    try {
      const currentItem = iterationState.iterableArray[iterationState.currentIndex];
      
      this.logger.native(`[Iteration] Processing item ${iterationState.currentIndex + 1}/${iterationState.totalItems}`);
      
      // Set current item as parameter
      await this.chatbot.addParameter(output, currentItem);
      
      // Execute intent (this will trigger the flow and eventually call back to this iteration via connector)
      // The intent execution is asynchronous and will complete later
      // The iteration will continue when DirIteration is called again (via connector from goToIntent)
      if (goToIntent) {
        this.#executeIntent(goToIntent, () => {
          // This callback is called when the HTTP request is sent, not when intent completes
          // The actual continuation happens when DirIteration is called again
          this.logger.native(`[Iteration] Item ${iterationState.currentIndex + 1} intent execution started, waiting for connector callback`);
        });
        
        // Return immediately - the iteration will continue on next DirIteration call
        // The goToIntent should have a connector that calls back to the intent containing this iteration
        callback(false); // Don't stop the flow
      } else {
        this.logger.warn("[Iteration] No goToIntent specified, processing items sequentially with delay");
        // If no intent to execute, process all remaining items with delay
        // This is a fallback mode that doesn't require external callbacks
        await this.#processRemainingItemsWithoutIntent(iterationState, actionId, output, callback);
      }
    } catch (error) {
      this.logger.error("[Iteration] Error processing current item: ", error);
      winston.error("[Iteration] Error processing current item: ", error);
      // Clear state on error to prevent stuck iterations
      await this.#clearIterationState(actionId);
      callback(true);
    }
  }

  async #processRemainingItemsWithoutIntent(iterationState, actionId, output, callback) {
    // Process all remaining items sequentially with delay
    // This is used when no goToIntent is specified
    for (let i = iterationState.currentIndex; i < iterationState.totalItems; i++) {
      const currentItem = iterationState.iterableArray[i];
      await this.chatbot.addParameter(output, currentItem);
      this.logger.native(`[Iteration] Processed item ${i + 1}/${iterationState.totalItems} (no intent execution)`);
      
      // Wait for delay before next item (except for last item)
      if (i < iterationState.totalItems - 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    // Clear state and complete
    await this.#clearIterationState(actionId);
    this.logger.native("[Iteration] Iteration completed (no intent mode)");
    callback(true);
  }

  async #getIterationState(actionId) {
    if (!this.tdcache || !this.requestId || !actionId) {
      return null;
    }
    
    try {
      const stateKey = `tilebot:requests:${this.requestId}:iteration:${actionId}`;
      const stateJson = await this.tdcache.get(stateKey);
      
      if (stateJson) {
        return JSON.parse(stateJson);
      }
      return null;
    } catch (error) {
      winston.error("[Iteration] Error getting iteration state: ", error);
      this.logger.error("[Iteration] Error getting iteration state: ", error);
      return null;
    }
  }

  async #saveIterationState(actionId, state) {
    if (!this.tdcache || !this.requestId || !actionId) {
      winston.error("[Iteration] Cannot save iteration state: missing tdcache, requestId, or actionId");
      return;
    }
    
    try {
      const stateKey = `tilebot:requests:${this.requestId}:iteration:${actionId}`;
      const stateJson = JSON.stringify(state);
      // Set TTL to 24 hours to prevent abandoned iterations
      await this.tdcache.set(stateKey, stateJson, { EX: 86400 });
    } catch (error) {
      winston.error("[Iteration] Error saving iteration state: ", error);
      this.logger.error("[Iteration] Error saving iteration state: ", error);
    }
  }

  async #clearIterationState(actionId) {
    if (!this.tdcache || !this.requestId || !actionId) {
      return;
    }
    
    try {
      const stateKey = `tilebot:requests:${this.requestId}:iteration:${actionId}`;
      await this.tdcache.del(stateKey);
      this.logger.native("[Iteration] Cleared iteration state");
    } catch (error) {
      winston.error("[Iteration] Error clearing iteration state: ", error);
      this.logger.error("[Iteration] Error clearing iteration state: ", error);
    }
  }

  async #findActiveIterationActionId() {
    // Fallback method to find active iteration when actionId is not available
    // This searches for any iteration state key for this requestId
    // Note: This is a simplified approach - Redis KEYS command should be used with caution in production
    if (!this.tdcache || !this.requestId) {
      return null;
    }
    
    try {
      // Try to get iteration state using a pattern
      // Since we don't have a direct way to list keys, we'll rely on the actionId being passed
      // This method is a placeholder for potential future enhancement
      // For now, return null and require actionId
      return null;
    } catch (error) {
      winston.error("[Iteration] Error finding active iteration: ", error);
      return null;
    }
  }

  async #executeIntent(destinationIntentId, callback) {
    let intentDirective = null;
    if (destinationIntentId) {
      intentDirective = DirIntent.intentDirectiveFor(destinationIntentId, null);
    }
    if (intentDirective) {
      this.logger.native("[Iteration] executing destinationIntentId");
      this.intentDir.execute(intentDirective, () => {
        if (callback) {
          callback();
        }
      })
    }
    else {
      this.logger.native("[Iteration] no block connected to intentId:", destinationIntentId);
      winston.debug("[Iteration] no block connected to intentId:" + destinationIntentId);
      if (callback) {
        callback();
      }
    }
  }

}

module.exports = { DirIteration };