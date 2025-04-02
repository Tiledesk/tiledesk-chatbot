const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "The Form v2",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"question": "next",
		"answer": "Hi I'm the next! And I locked nextone!\n\\_tdLockIntent --intentName \"nextone\"",
		"language": "en",
		"intent_display_name": "next"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "lock next",
		"answer": "next intent is now locked\n\\_tdLockIntent --intentName \"next\"",
		"language": "en",
		"intent_display_name": "lock"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "form",
		"answer": "Thanks for your data ${userFullname}, we got your email ${userEmail}\n\nMoving you to the first available agent\n",
		"language": "en",
		"intent_display_name": "test_form_intent"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "defaultFallback",
		"answer": "I can not provide an adequate answer. Write a new question or talk to a human agent.\n* Back to start tdIntent:start\n* See the docs https://docs.tiledesk.com/\n* 👨🏻‍🦰 I want an agent",
		"language": "en",
		"intent_display_name": "defaultFallback"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "Start a new dialog",
		"answer": "Hi welcome to this dialog. Whatever you write I don't care about it 😎\n\\_tdLockIntent --intentName \"dialog_question2\"",
		"language": "en",
		"intent_display_name": "dialog_start"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "my name",
		"answer": "your name is ${userFullname}",
		"language": "en",
		"intent_display_name": "myname"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "step number 2",
		"answer": "This is the second intent reply!",
		"language": "en",
		"intent_display_name": "2nd_intent_reply"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "Thanks ${userFullname} 🙂\n\nYou will be contacted by an agent as soon as we get back online!\n\\_tdwait 3000\n\\_tdIntent ratereply",
		"form": {
			"cancelCommands": ["cancel"],
			"cancelReply": "Form deleted",
			"id": 1,
			"name": "Base",
			"fields": [{
				"name": "userFullname",
				"type": "custom",
				"label": "What is your name?",
				"regex": "/.+/",
				"errorLabel": "Incorrect!"
			}, {
				"name": "userEmail",
				"type": "email",
				"regex": "/^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/",
				"label": "Hi ${userFullname}\n\nJust one last question\n\nYour email 🙂",
				"errorLabel": "${userFullname} this email address is invalid\n\nCan you insert a correct email address?"
			}]
		},
		"language": "en",
		"intent_display_name": "get_offline_lead"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "dialog_question3",
		"answer": "And now tell me, do you feel stressed out by your habits?\n\\_tdLockIntent --intentName \"dialog_question4\"",
		"language": "en",
		"intent_display_name": "dialog_question3"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "rating",
		"answer": "tdFrame,h300:https://chatbots.tiledesk.repl.co/apps/ratingform/${tdMessageId}",
		"language": "en",
		"intent_display_name": "rating"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "my data",
		"answer": "Your name is **${userFullname}** and you work for **${companyName}**\n\nYour email **${userEmail}**\n\nI hope I was helpful 🙂",
		"language": "en",
		"intent_display_name": "mydata"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "get here with a /",
		"answer": "You got it!\n* /start",
		"language": "en",
		"intent_display_name": "directintent"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "nextone",
		"answer": "I unlock everything!\n\\_tdUnlockIntent",
		"language": "en",
		"intent_display_name": "nextone"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "I'm sorry but we are closed right now!\n\nWould you like to provide us your data?\n\nYou will be contacted by an agent as soon as we get back online\n* Yes, I want to be contacted later tdIntent:get_offline_lead\n* ↩︎ Main menu tdIntent:start",
		"language": "en",
		"intent_display_name": "weareclosed"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "Thanks ${userFullname}\n\nYou'll be contacted by an agent as soon as we'll be back online\n\n* ↩︎ Main menu tdIntent:start",
		"form": {
			"fields": [{
				"name": "userFullname",
				"type": "text",
				"regex": "/^.{1,}$/",
				"label": "Provide us your data\n\nYou'll be contacted by an agent as soon as we go online!\n\nYour name",
				"errorLabel": ""
			}]
		},
		"language": "en",
		"intent_display_name": "get_data_while_offline"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "***",
		"answer": "Press the button to enable the text box...\n* Whatever you write unlock the box\n\\_tdDisableInputText",
		"language": "en",
		"intent_display_name": "disable_input"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "\\start",
		"answer": "tdImage:https://tidio-images-messenger.s3.amazonaws.com/syow1wpcd4vnrtfogriakjlqfr3nee0g/images/32f6c639-36cc-48a9-b0bd-8fcdca366637.gif\n\nHello\n* Start a new dialog\n* Good form\n* Invalid form\n* Rating\n* Latest arrivals\n* /directintent\n* /intent_directive\n* Action to start tdIntent:start\n* Want an agent flow tdIntent:wantagent\n* Disable input tdIntent:disable_input\n* Disable input + placeholder tdIntent:disable_input_with_placeholder\n* Departments tdIntent:departments\n* Agents Only tdIntent:onlyifagents\n* /form_regex\n* /form_res\n* /form_canceled_to_intent\n* /sendemail\n* /form_to_unfill\n* /delete_fullname\n* /all_filled\n* /move_to\n* /more_actions",
		"language": "en",
		"intent_display_name": "start"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "Latest arrivals",
		"answer": "tdImage:https://sparcofashion.it/wp-content/uploads/2021/06/1b1671b0-c9c8-11eb-bc75-e731d8413da3.jpg\n\nGeox sneakers, at 20$ instead of 90$!\n* Buy it\n* More deals!\n* /start",
		"language": "en",
		"intent_display_name": "latest_arrivals"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "Invalid form",
		"answer": "Get this reply immediatly. The form is invalid and is not processed\n* /start",
		"language": "en",
		"intent_display_name": "Invalid_form"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "\\_tdwhenopen \\_tdintent weareopen\n\\_tdwhenclosed \\_tdintent weareclosed",
		"language": "en",
		"intent_display_name": "wantagent"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "********",
		"answer": "Replying with intent latest_arrivals...\n\\_tdintent latest_arrivals",
		"language": "en",
		"intent_display_name": "intent_directive"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "Moving you to an agent...\n\\_tdagent",
		"form": {
			"fields": [{
				"name": "userFullname",
				"type": "Text",
				"regex": "/^.{1,}$/",
				"label": "I nostri agenti sono online\n\nPrima di contattarli vuoi lasciarci il tuo nome?",
				"errorLabel": "Il tuo nome non è corretto"
			}]
		},
		"language": "en",
		"intent_display_name": "weareopen"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "dialog_question4",
		"answer": "Well, survey completed! I'll tell you, you are a good guy!\n\nYour dialog ends here\n\n* Start a new dialog\n* /start\n\\_tdUnlockIntent",
		"language": "en",
		"intent_display_name": "dialog_question4"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "dialog_question2",
		"answer": "As I told you, whatever you wrote, I'll ask you... how do you feel today?\n\\_tdLockIntent --intentName \"dialog_question3\"",
		"language": "en",
		"intent_display_name": "dialog_question2"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "multi message",
		"answer": "\\_tdmessage ciao1",
		"language": "en",
		"intent_display_name": "multiple-messages"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "greet flow",
		"answer": "Hi, we know you're in a hurry 🙂\n\nBut we need to ask you your name before going on with this conversation\n\\_tdintent askUserName",
		"language": "en",
		"intent_display_name": "greet"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "***",
		"answer": "\\_tdintent start",
		"form": {
			"fields": [{
				"name": "userName",
				"type": "text",
				"regex": "/^.{1,}$/",
				"label": "What is your name?",
				"errorLabel": ""
			}]
		},
		"language": "en",
		"intent_display_name": "askUserName"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "going to start...\n\\_tdintent start",
		"language": "en",
		"intent_display_name": "gotostart"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "messageid",
		"answer": "questo è il message-id ${tdMessageId}",
		"language": "en",
		"intent_display_name": "messageid"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "Good form",
		"answer": "It's a good form ${your_fullname}\n* Back tdIntent:start",
		"form": {
			"cancelCommands": ["annulla", "cancella", "reset", "cancel"],
			"cancelReply": "Action canceled!",
			"fields": [{
				"name": "your_fullname",
				"type": "TEXT",
				"regex": "/^.{1,}$/",
				"label": "Your name?",
				"errorLabel": ""
			}]
		},
		"language": "en",
		"intent_display_name": "good_form"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "***",
		"answer": "Ti stiamo mettendo in contatto con uno dei nostri esperti che parla Italiano 🇮🇹\n\nUn attimo di pazienza... 🙏🏼\n\\_tddepartment Italian\n\\_tdhmessage start",
		"language": "en",
		"intent_display_name": "italian_dept"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "Input is disabled with a custom placeholder text\n* Go\n\\_tdDisableInputText --label \"Press a button to continue...\"",
		"language": "en",
		"intent_display_name": "disable_input_with_placeholder"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "Did I reply to your question?\n* Yes tdIntent:replyok\n* No tdIntent:replyko\n* ↩︎ Menu",
		"language": "en",
		"intent_display_name": "ratereply"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "Thanks! We'll take care of your feedback 🙂\n* ↩︎ Menu tdIntent:start",
		"language": "en",
		"intent_display_name": "replyok"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "We're sorry 😅\n\nWe'll take care of your feedback and we'll try to do better 🙂\n* ↩︎ Menu tdIntent:start",
		"language": "en",
		"intent_display_name": "replyko"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "We are going to...\n\nClosing this request 🙂\n\\_tdwait 3000\n\\_tdclose",
		"language": "en",
		"intent_display_name": "close"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "***",
		"answer": "reply",
		"language": "en",
		"intent_display_name": "buggedintent"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "**",
		"answer": "bug fixed",
		"form": {
			"fields": [{
				"name": "name",
				"type": "Text",
				"regex": "/^.{1,}$/",
				"label": "Your",
				"errorLabel": ""
			}]
		},
		"language": "en",
		"intent_display_name": "bugged2"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "form completata con ${username}",
		"form": {
			"cancelCommands": ["annulla", "cancella", "reset", "cancel"],
			"cancelReply": "Ok annullato!",
			"fields": [{
				"name": "username",
				"type": "text",
				"regex": "/^.{1,}$/",
				"label": "Come ti chiami?",
				"errorLabel": ""
			}]
		},
		"language": "en",
		"intent_display_name": "basicform"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "departments",
		"answer": "Choose your department 👇\n* Support tdIntent:supportDepartment\n* Webmaster tdIntent:webmasterDepartment",
		"language": "en",
		"intent_display_name": "departments"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "support department",
		"answer": "Moving you to Support department...\n\\_tddepartment support\n\\_tdintent start",
		"language": "en",
		"intent_display_name": "supportDepartment"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "Evaluating conditional flow...\n\\_tdIfNoAgents \\_tdintent no_agents_available\n\\_tdIfAgents \\_tdintent agents_available\n\\_tdWhenClosed \\_tdintent weareclosed\n",
		"language": "en",
		"intent_display_name": "onlyifagents"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "🥺 NO AGENTS AVAILABLE 🥺\n* /start",
		"language": "en",
		"intent_display_name": "no_agents_available"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "AGENTS AVAILABLE 🎉\n* /start",
		"language": "en",
		"intent_display_name": "agents_available"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "***",
		"answer": "tdImage:https://sparcofashion.it/wp-content/uploads/2021/06/1b1671b0-c9c8-11eb-bc75-e731d8413da3.jpg",
		"language": "en",
		"intent_display_name": "image"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "***",
		"answer": "Got it ${order_number}",
		"form": {
			"cancelCommands": ["cancel"],
			"cancelReply": "Form deleted",
			"id": "custom-model",
			"name": "Custom",
			"fields": [{
				"name": "order_number",
				"type": "CUSTOM",
				"regex": "^.*$",
				"label": "Ordine",
				"errorLabel": "Errore"
			}, {
				"name": "lastname",
				"type": "TEXT",
				"regex": "^.{1,}$",
				"label": "Nome",
				"errorLabel": ""
			}, {
				"name": "citta",
				"type": "TEXT",
				"regex": "^.{1,}$",
				"label": "Dove sei nato?\n\nScegli una citta 👇\n* Lecce\n* Milano",
				"errorLabel": ""
			}]
		},
		"language": "en",
		"intent_display_name": "form_regex"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "reserved form data",
		"answer": "Hi ${userFullname}\n\nYou email ${userEmail}\n\nData ok!",
		"form": {
			"cancelCommands": ["cancel"],
			"cancelReply": "Form deleted",
			"id": 1,
			"name": "Base",
			"fields": [{
				"name": "userFullname",
				"type": "text",
				"label": "What is your name?"
			}, {
				"name": "userEmail",
				"type": "email",
				"regex": "/^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/",
				"label": "Hi ${userFullname}\n\nJust one last question\n\nYour email 🙂",
				"errorLabel": "${userFullname} this email address is invalid\n\nCan you insert a correct email address?"
			}]
		},
		"language": "en",
		"intent_display_name": "form_res"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "fire tiledesk event",
		"answer": "Firing event...\n\\_tdFireTiledeskEvent chatbot_event\n\\_tdMessage \"event fired!\"",
		"language": "en",
		"intent_display_name": "fire_tdevent"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "splitted",
		"answer": "Row1\n\nRow2\ntdImage:https://nypost.com/wp-content/uploads/sites/2/2020/03/covid-tiger-01.jpg?quality=75&strip=all&w=1488\n\nRow4\n* /start",
		"language": "en",
		"intent_display_name": "splitted"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "Ciao\n\nAdesso so che hai ${age} anni\n\nContinuo su un altro intent...",
		"form": {
			"cancelCommands": ["cancel"],
			"cancelReply": "Form deleted",
			"id": "custom-model",
			"name": "Custom",
			"fields": [{
				"name": "age",
				"type": "TEXT",
				"regex": "^.{1,}$",
				"label": "quanti anni hai?",
				"errorLabel": ""
			}]
		},
		"language": "en",
		"intent_display_name": "moveto"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "****",
		"answer": "Tu hai ${age} anni.",
		"language": "en",
		"intent_display_name": "quantianniho"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "***",
		"answer": "got ${name}",
		"form": {
			"cancelCommands": ["cancel"],
			"cancelReply": "Form deleted\n\\_tdintent start",
			"id": "custom-model",
			"name": "Custom",
			"fields": [{
				"name": "name",
				"type": "CUSTOM",
				"regex": "^.{1,}$",
				"label": "your name",
				"errorLabel": ""
			}]
		},
		"language": "en",
		"intent_display_name": "form_canceled_to_intent"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "send email",
		"answer": "Ti sto inviando l'email di notifica qui: ${sendEmailNotification}...\n\\_tdsendemail --to \"${sendEmailNotification}\" --subject \"Test  conv\" --text \"Hai un nuovo Lead 🙂\\n\\nSi chiama ${userFullname}\\n\\nBy Tiledesk\"\n\\_tdmessage Fatto 🙂",
		"language": "en",
		"intent_display_name": "sendemail",
		"form": {
			"cancelCommands": ["cancel"],
			"cancelReply": "Form deleted",
			"id": "custom-model",
			"name": "Custom",
			"fields": [{
				"name": "userFullname",
				"type": "TEXT",
				"regex": "^.{1,}$",
				"label": "Ciao!\n\nStiamo simulando l'acquisizione di un nuovo Lead e la conseguente notifica email.\n\nSupponiamo che il lead inizi la conversazione adesso. Per prima cosa gli chiederemo il nome (e solo quello, per semplicità).\n\nIniziamo...\n\nCiao (rivolto al Lead)!\n\nCome ti chiami?",
				"errorLabel": ""
			}, {
				"name": "sendEmailNotification",
				"type": "EMAIL",
				"regex": "^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$",
				"label": "Perfetto!\n\nAppena acquisito il fullname del lead (${userFullname})\n\nIl chatbot invierà adesso una email con la notifica del nuovo lead.\n\nDammi la tua email, quella dove riceverai la notifica",
				"errorLabel": ""
			}]
		}
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "***",
		"answer": "Thanks ${fullname}\nYour email ${youremail}",
		"form": {
			"cancelCommands": ["cancel"],
			"cancelReply": "Form deleted",
			"id": "custom-model",
			"name": "Custom",
			"fields": [{
				"name": "fullname",
				"type": "TEXT",
				"regex": "^.{1,}$",
				"label": "Your name?",
				"errorLabel": ""
			}, {
				"name": "youremail",
				"type": "TEXT",
				"regex": "^.{1,}$",
				"label": "Your email?",
				"errorLabel": ""
			}]
		},
		"language": "en",
		"intent_display_name": "form_to_unfill"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "***",
		"answer": "deleting fullname...\n\\_tddelete fullname",
		"language": "en",
		"intent_display_name": "delete_fullname"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "***",
		"answer": "You filled\nfullname: ${fullname}\nyouremail: ${youremail}",
		"language": "en",
		"intent_display_name": "all_filled"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "***",
		"answer": "deleting youremail: ${youremail} ...\n\\_tddelete youremail",
		"language": "en",
		"intent_display_name": "delete_youremail"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "***",
		"answer": "\\_tddelete fullname\n\\_tddelete youremail\n\\_tdintent all_filled",
		"language": "en",
		"intent_display_name": "delete_all"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "***",
		"answer": "moving to *target_intent*...\n\\_tdintent target_intent",
		"language": "en",
		"intent_display_name": "move_to"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"question": "***",
		"answer": "The target!",
		"language": "en",
		"intent_display_name": "target_intent"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "did it",
		"form": {
			"cancelCommands": ["cancel"],
			"cancelReply": "Form deleted\n* /start",
			"id": "custom-model",
			"name": "Custom",
			"fields": [{
				"name": "name",
				"type": "TEXT",
				"regex": "^.{1,}$",
				"label": "Your name?\n\n(type *cancel* to stop proceeding)",
				"errorLabel": ""
			}]
		},
		"language": "en",
		"intent_display_name": "form_cancel_with_button"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "Your name ${userFullname}\n\nYour email ${userEmail}\n* /start",
		"form": {
			"cancelCommands": ["cancel"],
			"cancelReply": "Form deleted",
			"id": "custom-model",
			"name": "Custom",
			"fields": [{
				"name": "userFullname",
				"type": "TEXT",
				"regex": "^.{1,}$",
				"label": "Your name?",
				"errorLabel": ""
			}, {
				"name": "userEmail",
				"type": "TEXT",
				"regex": "^.{1,}$",
				"label": "Your email?",
				"errorLabel": ""
			}]
		},
		"language": "en",
		"intent_display_name": "form_reserved_data"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "\\_tdifOpenHours we_are_open\n\\_tdifNotOpenHours we_are_closed",
		"language": "en",
		"intent_display_name": "if_open_hours"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "We are open!",
		"language": "en",
		"intent_display_name": "we_are_open"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "More...\n* ↩︎ Back tdIntent:start\n* /if_open_hours\n* /replace_bot\n* /assign_is_open\n* /assign_available_agents\n* /if_available_agents_do",
		"language": "en",
		"intent_display_name": "more_actions"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "Replacing with Support Bot...\n\\_tdReplaceBot Support Bot\n\\_tdhmessage /start",
		"language": "en",
		"intent_display_name": "replace_bot"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "Sorry but we are closed right now",
		"language": "en",
		"intent_display_name": "we_are_closed"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "\\_tdfunctionValue --functionName \"openNow\" --assignTo \"is_open\"\n\\_tdmessage Are we open? ${is_open}",
		"language": "en",
		"intent_display_name": "assign_is_open"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "\\_tdfunctionValue --functionName \"availableAgents\" --assignTo \"available_agents\"\n\\_tdmessage Are there available agents? ${available_agents}\n\\_tdintent if_available_agents_do",
		"language": "en",
		"intent_display_name": "assign_available_agents"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "\\_tdfunctionValue --functionName \"availableAgents\" --assignTo \"available_agents\"\n\\_tdcondition --condition \"Number($available_agents) >= Number(1)\" --trueIntent agents_online --falseIntent agents_offline",
		"language": "en",
		"intent_display_name": "if_available_agents_do"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "****",
		"answer": "Our agents are all **offline**",
		"language": "en",
		"intent_display_name": "agents_offline"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "**Agents online**!",
		"language": "en",
		"intent_display_name": "agents_online"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "\\_tddelete ${deleteThis}\n\\_tdmessage \"available agents: '${available_agents}'",
		"language": "en",
		"intent_display_name": "delete"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "Sending email to: ${email_recipient}\nSubject: ${email_subject}\nBody: ${email_body}\n\\_tdsendemail --to \"${email_recipient}\" --subject \"${email_subject}\" --text \"${email_body}\"\n\\_tdmessage I did it 🙂",
		"language": "en",
		"intent_display_name": "send_email_params"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "**",
		"answer": "\\_tdassign --expression \"23\" --assignTo \"age\"\n\\_tdmessage assigned to **age** value of ${age}",
		"language": "en",
		"intent_display_name": "assign"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "\\_tdassign --assignTo \"myvar\" --expression \"$variableName\"\n\\_tdmessage myvar: ${myvar}",
		"language": "en",
		"intent_display_name": "assign_params"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "you live in ${tdCity} (${tdCountry})",
		"language": "en",
		"intent_display_name": "location"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "\\_tdcondition --condition \"$tdCountry === \\\"IT\\\"\" --trueIntent \"live_in_italy\" --falseIntent \"live_outside_italy\"",
		"language": "en",
		"intent_display_name": "if_you_live_IT"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "You live in Italy! Wow\n\ntdImage:https://media-cdn.tripadvisor.com/media/photo-s/0d/be/e8/dd/trattoria-casereccia.jpg\n\nGo with the Italian menu 😋 👇\n* 🍝 Spaghetti\n* 🥟 Ravioli\n* 🥩 Bistecca ai ferri",
		"language": "en",
		"intent_display_name": "live_in_italy"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "You don't live in Italy!\n* /start",
		"language": "en",
		"intent_display_name": "live_outside_italy"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "press this action button\n* Action Button tdIntent:action_button_intent{\"setupVar\":\"123\"}",
		"language": "en",
		"intent_display_name": "actionbutton"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"question": "***",
		"answer": "setupVar is: ${setupVar}",
		"language": "en",
		"intent_display_name": "action_button_intent"
	}]
}

// normalize the bot structure for the static intent search
let intents = bot.intents;
delete bot.intents;
intent_dict = {};
for (let i = 0; i < intents.length; i++) {
  intent_dict[intents[i].intent_display_name] = intents[i];
}
bot.intents = intent_dict;
const bots_data = {
  "bots": {}
}
bots_data.bots["botID"] = bot;

module.exports = { bots_data: bots_data };