const { DirIntent } = require('../flow/DirIntent');
const winston = require('../../utils/winston');
const tiledeskApiService = require('../../services/TiledeskApiService');
const { BaseDirective } = require('../BaseDirective');
const { Directives } = require('../Directives');

class DirIfOpenHours extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.IF_OPEN_HOURS];

  constructor(context) {
    super(context);

    this.intentDir = new DirIntent(context);
  }

  execute(directive, callback) {
    winston.verbose("Execute IfOpenHours directive");
    let action;
    if (directive.action) {
      action = directive.action
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirIfOpenHours Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[If Operating Hours] Action complteted");
      callback(stop);
    });
  }

  go(action, callback) {
    winston.debug("(DirIfOpenHours) Action: ", action);

    // `let`, not `const`: the two blank-name normalisations below assign to
    // these. As consts they threw "TypeError: Assignment to constant variable"
    // straight out of go() for an intent name that is present but blank -- the
    // shape the designer produces when a branch is wired and then cleared. The
    // sibling DirCondition has the identical lines with `let`.
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    const trueIntentAttributes = action.trueIntentAttributes;
    const falseIntentAttributes = action.falseIntentAttributes;
    const stopOnConditionMet = action.stopOnConditionMet;
    
    if (trueIntent && trueIntent.trim() === "") {
      trueIntent = null;
    }
    if (falseIntent && falseIntent.trim() === "") {
      falseIntent = null;
    }

    if (!trueIntent && !falseIntent) {
      this.logger.error("[If Operating Hours] Invalid condition, no intents specified");
      winston.error("(DirIfOpenHours) Invalid condition, no intents specified");
      callback();
      return;
    }
    
    let slot_id = null;
    if (action.slotId) {
      slot_id = action.slotId;
    }
    
    // NOTE: `go` is deliberately NOT async, so that nothing raised on the way
    // to the service call turns into a silently rejected promise. The service
    // call is chained instead.
    tiledeskApiService.isOpen(
      this.context.projectId, this.context.token, slot_id, "(DirIfOpenHours)"
    ).then(async ({ err, resbody }) => {

      winston.debug("(DirIfOpenHours) resbody:", resbody);

      if (err) {
        this.logger.error("[If Operating Hours] Error response: ", err.response);
        winston.debug("(DirIfOpenHours) error: ", err);
        if (callback) {
          if (falseIntent) {
            let intentDirective = DirIntent.intentDirectiveFor(falseIntent);
            winston.debug("(DirIfOpenHours) !agents (openHours) => falseIntent " + falseIntent);
            this.intentDir.execute(intentDirective, () => {
              callback(stopOnConditionMet);
            });
          }
          else {
            // Without this the callback was only reachable inside
            // `if (falseIntent)`: a block configured with only a true branch
            // never called back and the conversation stalled silently whenever
            // the operating-hours API was down -- no reply, no log, no error.
            winston.debug("(DirIfOpenHours) No falseIntent to run after the isopen error");
            callback();
          }
        }
      } else {
        if (resbody.isopen && resbody.isopen === true) {
          this.logger.native("[If Operating Hours] is open: true")
          if (trueIntent) {
            let intentDirective = DirIntent.intentDirectiveFor(trueIntent);
            winston.debug("(DirIfOpenHours) agents (openHours) => trueIntent");
            this.intentDir.execute(intentDirective, () => {
              callback(stopOnConditionMet);
            });
          }
          else {
            // The `callback()` used to sit outside this branch, so a configured
            // true intent called back TWICE: once here with `undefined`, and
            // once when the intent finished. The second call re-entered the
            // rest of the flow. It belongs to the "no branch configured" case
            // only -- which is how DirCondition writes it.
            winston.debug("(DirIfOpenHours) No trueIntent to run");
            callback();
          }
          return;
        } else {
          this.logger.native("[If Operating Hours] is open: false")
          if (falseIntent) {
            let intentDirective = DirIntent.intentDirectiveFor(falseIntent);
            winston.debug("(DirIfOpenHours) !agents (openHours) => falseIntent", falseIntent);
            this.intentDir.execute(intentDirective, () => {
              callback(stopOnConditionMet);
            });
          }
          else {
            winston.debug("(DirIfOpenHours) No falseIntent to run");
            callback();
          }
          return;
        }
      }
    })

    // this.tdClient.openNow(action.slot_id, (err, result) => {

    //   if (err) {
    //     callback();
    //   }
    //   else if (result && result.isopen) {
    //     if (trueIntent) {
    //       let intentDirective = DirIntent.intentDirectiveFor(trueIntent);
    //       this.intentDir.execute(intentDirective, () => {
    //         callback(stopOnConditionMet);
    //       });
    //     }
    //     else {
    //       callback();
    //       return;
    //     }
    //   }
    //   else if (falseIntent) {
    //     let intentDirective = DirIntent.intentDirectiveFor(falseIntent);
    //     this.intentDir.execute(intentDirective, () => {
    //       callback(stopOnConditionMet);
    //     });
    //   }
    //   else {
    //     callback();
    //   }
    // });
  }

}

module.exports = { DirIfOpenHours };