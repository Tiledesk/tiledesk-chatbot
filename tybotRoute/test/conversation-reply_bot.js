const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Reply",
	"slug": "reply",
	"type": "tilebot",
	"subtype": "chatbot",
	"intents": [
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionType": "intent",
					"intentName": "#59578b9a-3029-4df8-993f-5f52c2a30882",
					"_tdActionId": "803b836c3b314d588254eecc638dd8da"
				}
			],
			"id_faq_kb": "69d7c4093084b50013ed64ae",
			"intent_id": "384dfa86-b568-4cae-a39e-12ab625d5e0e",
			"question": "\\start",
			"intent_display_name": "start",
			"language": "en",
			"attributes": {
				"position": {
					"x": 172,
					"y": 384
				},
				"readonly": true,
				"color": "156,163,205",
				"nextBlockAction": {
					"_tdActionTitle": "",
					"_tdActionId": "9ce3b65a-e0cd-4e9d-af54-6f6b10eed8b0",
					"_tdActionType": "intent"
				}
			},
			"agents_available": false
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [
							{
								"type": "wait",
								"time": 500
							},
							{
								"type": "message",
								"message": {
									"type": "text",
									"text": "Hi, how can I help you?",
									"attributes": {
										"attachment": {
											"type": "template",
											"buttons": [],
											"json_buttons": "",
											"json_gallery": ""
										}
									}
								}
							}
						]
					},
					"text": "Hi, how can I help you?\r\n",
					"_tdActionId": "470937bca3fa4a20851ab9328d469756"
				}
			],
			"id_faq_kb": "69d7c4093084b50013ed64ae",
			"intent_id": "59578b9a-3029-4df8-993f-5f52c2a30882",
			"intent_display_name": "welcome",
			"language": "en",
			"attributes": {
				"position": {
					"x": 458,
					"y": 84
				},
				"color": "156,163,205",
				"nextBlockAction": {
					"_tdActionTitle": "",
					"_tdActionId": "de0f7d92-7bfb-4a26-bc6e-a2aca85d7089",
					"_tdActionType": "intent"
				}
			},
			"agents_available": false
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionType": "reply",
					"text": "I didn't understand. Can you rephrase your question?",
					"attributes": {
						"commands": [
							{
								"type": "wait",
								"time": 500
							},
							{
								"type": "message",
								"message": {
									"type": "text",
									"text": "I didn't understand. Can you rephrase your question?"
								}
							}
						]
					}
				}
			],
			"id_faq_kb": "69d7c4093084b50013ed64ae",
			"intent_id": "f7c9d5a9-1462-4799-82e1-b8fa332cb920",
			"intent_display_name": "defaultFallback",
			"language": "en",
			"attributes": {
				"position": {
					"x": 714,
					"y": 528
				}
			},
			"agents_available": false
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "cb45a45d-5e84-433f-9c8b-6f36990591fb",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [
							{
								"type": "wait",
								"time": 500
							},
							{
								"type": "message",
								"message": {
									"type": "text",
									"text": "A chat message will be sent to the visitor",
									"attributes": {
										"attachment": {
											"type": "template",
											"buttons": [],
											"json_buttons": "",
											"json_gallery": ""
										}
									}
								}
							}
						]
					}
				}
			],
			"id_faq_kb": "69d7c4093084b50013ed64ae",
			"language": "en",
			"intent_display_name": "text",
			"intent_id": "674fb42c-8345-4637-b398-0f0e9939cbe1",
			"agents_available": false,
			"attributes": {
				"position": {
					"x": 972,
					"y": 65.5
				},
				"nextBlockAction": {
					"_tdActionId": "505ea7ee-215a-475d-a0cd-e3ade4439724",
					"_tdActionType": "intent",
					"intentName": ""
				},
				"connectors": {},
				"color": "156,163,205",
				"readonly": false
			}
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "31cdd83f-7739-440a-9e1a-d615930aace3",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [
							{
								"type": "wait",
								"time": 500
							},
							{
								"type": "message",
								"message": {
									"type": "image",
									"text": "",
									"metadata": {
										"name": "0S8P41N4P688D4MAK3B4FS4L3HYFQWSZ.png",
										"src": "https://stage.eks.tiledesk.com/api/files?path=uploads%2Fprojects%2F65c5f17ab4e95a0013a0181a%2Ffiles%2F910e0db4-3c62-4ac6-883f-7f9437ab3931%2F0S8P41N4P688D4MAK3B4FS4L3HYFQWSZ.png",
										"width": 420,
										"height": 280,
										"type": "image/png",
										"uid": "mnrmlu4w",
										"size": 58057,
										"downloadURL": "https://stage.eks.tiledesk.com/api/files/download?path=uploads%2Fprojects%2F65c5f17ab4e95a0013a0181a%2Ffiles%2F910e0db4-3c62-4ac6-883f-7f9437ab3931%2F0S8P41N4P688D4MAK3B4FS4L3HYFQWSZ.png"
									},
									"attributes": {
										"attachment": {
											"type": "template",
											"buttons": [],
											"json_buttons": "",
											"json_gallery": ""
										}
									}
								}
							}
						]
					}
				}
			],
			"id_faq_kb": "69d7c4093084b50013ed64ae",
			"language": "en",
			"intent_display_name": "image",
			"intent_id": "d2abbed0-1703-4ee5-9fdc-626b6c60d3b3",
			"agents_available": false,
			"attributes": {
				"position": {
					"x": 1302,
					"y": 58
				},
				"nextBlockAction": {
					"_tdActionId": "6bf523f5-6829-44ee-997b-ef32b15c7a3b",
					"_tdActionType": "intent",
					"intentName": ""
				},
				"connectors": {},
				"color": "156,163,205",
				"readonly": false
			}
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "72d78880-7d59-4dc2-9c8c-e9019a0ffea5",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [
							{
								"type": "wait",
								"time": 500
							},
							{
								"type": "message",
								"message": {
									"type": "frame",
									"text": "",
									"metadata": {
										"src": "https://www.youtube.com/embed/hJ6mPrtjgSk",
										"downloadURL": "",
										"width": "100%",
										"height": "100px",
										"type": "frame"
									}
								}
							}
						]
					}
				}
			],
			"id_faq_kb": "69d7c4093084b50013ed64ae",
			"language": "en",
			"intent_display_name": "frame",
			"intent_id": "47e3081f-1359-4b06-868b-c59f14580691",
			"agents_available": false,
			"attributes": {
				"position": {
					"x": 1646,
					"y": 56
				},
				"nextBlockAction": {
					"_tdActionId": "4088ef2a-0461-42c5-8b70-3c435e464e01",
					"_tdActionType": "intent",
					"intentName": ""
				},
				"connectors": {},
				"color": "156,163,205",
				"readonly": false
			}
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "c9556cb5-c0e2-460b-aa78-58c23ebc6e39",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [
							{
								"type": "wait",
								"time": 500
							},
							{
								"type": "message",
								"message": {
									"type": "gallery",
									"text": "This is a gallery text message",
									"attributes": {
										"attachment": {
											"type": "gallery",
											"gallery": [
												{
													"preview": {
														"name": "0S8P41N4P688D4MAK3B4FS4L3HYFQWSZ.png",
														"src": "https://stage.eks.tiledesk.com/api/files?path=uploads%2Fprojects%2F65c5f17ab4e95a0013a0181a%2Ffiles%2Fce03c337-40d6-48c4-8eb1-7c56745a5c67%2F0S8P41N4P688D4MAK3B4FS4L3HYFQWSZ.png",
														"width": 420,
														"height": 280,
														"type": "image/png",
														"uid": "mnrn927p",
														"size": 58057,
														"downloadURL": "https://stage.eks.tiledesk.com/api/files/download?path=uploads%2Fprojects%2F65c5f17ab4e95a0013a0181a%2Ffiles%2Fce03c337-40d6-48c4-8eb1-7c56745a5c67%2F0S8P41N4P688D4MAK3B4FS4L3HYFQWSZ.png"
													},
													"title": "Type title 1",
													"description": "Type description 1",
													"buttons": [
														{
															"uid": "7de5c1f9ee134460b77d4b2b6da1f284",
															"type": "text",
															"value": "Button",
															"link": "",
															"target": "blank",
															"action": "",
															"attributes": "",
															"show_echo": true
														}
													]
												},
												{
													"preview": {
														"name": "pngtree_3d_cartoon_businessman_wearing_headset_clipart_illustration.png",
														"src": "https://stage.eks.tiledesk.com/api/files?path=uploads%2Fprojects%2F65c5f17ab4e95a0013a0181a%2Ffiles%2F7d5d0ca3-1a92-4a55-808e-46c9376e25cf%2Fpngtree_3d_cartoon_businessman_wearing_headset_clipart_illustration.png",
														"width": 360,
														"height": 360,
														"type": "image/png",
														"uid": "mnrn9tkb",
														"size": 115856,
														"downloadURL": "https://stage.eks.tiledesk.com/api/files/download?path=uploads%2Fprojects%2F65c5f17ab4e95a0013a0181a%2Ffiles%2F7d5d0ca3-1a92-4a55-808e-46c9376e25cf%2Fpngtree_3d_cartoon_businessman_wearing_headset_clipart_illustration.png"
													},
													"title": "Type title 2",
													"description": "Type description 2",
													"buttons": [
														{
															"uid": "563959c911084d96be2a624d30af422e",
															"type": "text",
															"value": "Button",
															"link": "",
															"target": "blank",
															"action": "",
															"attributes": "",
															"show_echo": true
														}
													]
												}
											]
										}
									}
								}
							}
						]
					}
				}
			],
			"id_faq_kb": "69d7c4093084b50013ed64ae",
			"language": "en",
			"intent_display_name": "gallery",
			"intent_id": "0b7b917b-3d4f-4dc7-a7b5-f79620353ee2",
			"agents_available": false,
			"attributes": {
				"position": {
					"x": 2000,
					"y": 56
				},
				"nextBlockAction": {
					"_tdActionId": "e9327abb-5bf7-44ab-af2b-e0464f2584c6",
					"_tdActionType": "intent",
					"intentName": ""
				},
				"connectors": {},
				"color": "156,163,205",
				"readonly": false
			}
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "04f93adb-caea-4b2c-a2fe-4232fba0935d",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [
							{
								"type": "wait",
								"time": 500
							},
							{
								"type": "message",
								"message": {
									"type": "redirect",
									"text": "",
									"metadata": {
										"src": "https://youtu.be/hJ6mPrtjgSk?si=9cEZBv3nwC1exx74",
										"downloadURL": "",
										"target": "blank",
										"type": "redirect"
									}
								}
							}
						]
					}
				}
			],
			"id_faq_kb": "69d7c4093084b50013ed64ae",
			"language": "en",
			"intent_display_name": "redirect",
			"intent_id": "f3835a5b-a3f8-4014-bbc7-a49721e5c170",
			"agents_available": false,
			"attributes": {
				"position": {
					"x": 2341,
					"y": 54
				},
				"nextBlockAction": {
					"_tdActionId": "1b158b6b-1f0f-4b23-baae-6a98fda5631b",
					"_tdActionType": "intent",
					"intentName": ""
				},
				"connectors": {},
				"color": "156,163,205",
				"readonly": false
			}
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "ea103256-9ea4-4c4f-bc33-1cdd5b915cb4",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [
							{
								"type": "wait",
								"time": 500
							},
							{
								"type": "message",
								"message": {
									"type": "tts",
									"text": "This message will be played as audio",
									"attributes": {
										"attachment": {
											"type": "template",
											"buttons": [],
											"json_buttons": "",
											"json_gallery": ""
										}
									}
								}
							}
						]
					}
				}
			],
			"id_faq_kb": "69d7c4093084b50013ed64ae",
			"language": "en",
			"intent_display_name": "tts",
			"intent_id": "d2c3d9a9-a23f-4678-a5fd-e89c9ac9c60d",
			"agents_available": false,
			"attributes": {
				"position": {
					"x": 2684,
					"y": 56
				},
				"nextBlockAction": {
					"_tdActionId": "649edbb3-ba15-480c-b8af-5eb005e2a158",
					"_tdActionType": "intent",
					"intentName": ""
				},
				"connectors": {},
				"color": "156,163,205",
				"readonly": false
			}
		}
	],
	"attributes": {
		"globals": [
			{
				"key": "VOICE_PROVIDER",
				"value": "openai"
			},
			{
				"key": "TTS_VOICE_NAME",
				"value": "alloy"
			},
			{
				"key": "TTS_VOICE_LANGUAGE",
				"value": "en"
			},
			{
				"key": "TTS_MODEL",
				"value": "tts-1"
			},
			{
				"key": "STT_MODEL",
				"value": "gpt-4o-mini-transcribe"
			}
		]
	}
}

// normalize the bot structure for the static intent search
let intents = bot.intents;
delete bot.intents;
let intents_dict_by_display_name = {};
for (let i = 0; i < intents.length; i++) {
	intents_dict_by_display_name[intents[i].intent_display_name] = intents[i];
}
let intents_dict_by_intent_id = {};
for (let i = 0; i < intents.length; i++) {
	intents_dict_by_intent_id[intents[i].intent_id] = intents[i];
}

bot.intents = intents_dict_by_display_name;
bot.intents_by_intent_id = intents_dict_by_intent_id
const bots_data = {
	"bots": {}
}
bots_data.bots["botID"] = bot;


module.exports = { bots_data: bots_data };