I'll start by fetching the test flow template and reading all three component.json files simultaneously.

---

Let me try listing the connector components and loading the files directly.

---

Now I have all the information needed. Let me analyze the components:

- **CreateCustomModule**: Required inputs — `moduleName`, `singularLabel`, `pluralLabel`. Outputs — `apiName`, `moduleId`, `singularLabel`, `pluralLabel`, `status`, etc.
- **GetCustomModule**: Input — `module_api_name`. Output — `custom_modules` (array with display_name, api_name, module_id, etc.)
- **FindCustomModules**: Inputs — `searchQuery`, `sortBy`, `sortOrder`, `outputType`. Dynamic output.

The flow will:
1. **Create** a custom module → Assert `apiName` is not empty (Branch 1)
2. **Get** the module using its API name → Assert `custom_modules` is not empty (Branch 2)
3. **Find** modules with a search query → Assert `items` is not empty (Branch 3)
4. All 3 Assert branches converge at **AfterAll** → **ProcessE2EResults**

> **Note**: There is no `DeleteCustomModule` component in this connector, so cleanup of the created test module is not possible within this flow.

```json
{
    "name": "E2E Zoho/crm - Custom Module Lifecycle",
    "description": "End-to-end test for Zoho CRM - tests custom module lifecycle: create, get, and find custom modules",
    "flow": {
        "start": {
            "type": "appmixer.utils.controls.OnStart",
            "x": 100,
            "y": 300,
            "source": {},
            "version": "1.0.0",
            "config": {}
        },
        "create-custom-module": {
            "type": "appmixer.zoho.crm.CreateCustomModule",
            "x": 300,
            "y": 300,
            "version": "1.0.0",
            "source": {
                "in": {
                    "start": ["out"]
                }
            },
            "config": {
                "transform": {
                    "in": {
                        "start": {
                            "out": {
                                "type": "json2new",
                                "modifiers": {
                                    "moduleName": {},
                                    "singularLabel": {},
                                    "pluralLabel": {},
                                    "description": {}
                                },
                                "lambda": {
                                    "moduleName": "E2E_Test_Custom_Mod",
                                    "singularLabel": "E2E Test Module",
                                    "pluralLabel": "E2E Test Modules",
                                    "description": "E2E test custom module for automated testing"
                                }
                            }
                        }
                    }
                }
            }
        },
        "assert-create": {
            "type": "appmixer.utils.test.Assert",
            "x": 500,
            "y": 100,
            "version": "1.0.0",
            "source": {
                "in": {
                    "create-custom-module": ["out"]
                }
            },
            "config": {
                "transform": {
                    "in": {
                        "create-custom-module": {
                            "out": {
                                "type": "json2new",
                                "modifiers": {
                                    "expression": {
                                        "api-name-var": {
                                            "variable": "$.create-custom-module.out.apiName",
                                            "functions": []
                                        }
                                    }
                                },
                                "lambda": {
                                    "expression": {
                                        "AND": [
                                            {
                                                "field": "{{{api-name-var}}}",
                                                "assertion": "notEmpty"
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        "get-custom-module": {
            "type": "appmixer.zoho.crm.GetCustomModule",
            "x": 500,
            "y": 300,
            "version": "1.0.0",
            "source": {
                "in": {
                    "create-custom-module": ["out"]
                }
            },
            "config": {
                "transform": {
                    "in": {
                        "create-custom-module": {
                            "out": {
                                "type": "json2new",
                                "modifiers": {
                                    "module_api_name": {
                                        "api-name-get-var": {
                                            "variable": "$.create-custom-module.out.apiName",
                                            "functions": []
                                        }
                                    }
                                },
                                "lambda": {
                                    "module_api_name": "{{{api-name-get-var}}}"
                                }
                            }
                        }
                    }
                }
            }
        },
        "assert-get": {
            "type": "appmixer.utils.test.Assert",
            "x": 700,
            "y": 300,
            "version": "1.0.0",
            "source": {
                "in": {
                    "get-custom-module": ["out"]
                }
            },
            "config": {
                "transform": {
                    "in": {
                        "get-custom-module": {
                            "out": {
                                "type": "json2new",
                                "modifiers": {
                                    "expression": {
                                        "modules-var": {
                                            "variable": "$.get-custom-module.out.custom_modules",
                                            "functions": []
                                        }
                                    }
                                },
                                "lambda": {
                                    "expression": {
                                        "AND": [
                                            {
                                                "field": "{{{modules-var}}}",
                                                "assertion": "notEmpty"
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        "find-custom-modules": {
            "type": "appmixer.zoho.crm.FindCustomModules",
            "x": 500,
            "y": 500,
            "version": "1.0.0",
            "source": {
                "in": {
                    "create-custom-module": ["out"]
                }
            },
            "config": {
                "transform": {
                    "in": {
                        "create-custom-module": {
                            "out": {
                                "type": "json2new",
                                "modifiers": {
                                    "searchQuery": {},
                                    "sortBy": {},
                                    "sortOrder": {},
                                    "outputType": {}
                                },
                                "lambda": {
                                    "searchQuery": "E2E",
                                    "sortBy": "created_time",
                                    "sortOrder": "desc",
                                    "outputType": "array"
                                }
                            }
                        }
                    }
                }
            }
        },
        "assert-find": {
            "type": "appmixer.utils.test.Assert",
            "x": 700,
            "y": 500,
            "version": "1.0.0",
            "source": {
                "in": {
                    "find-custom-modules": ["out"]
                }
            },
            "config": {
                "transform": {
                    "in": {
                        "find-custom-modules": {
                            "out": {
                                "type": "json2new",
                                "modifiers": {
                                    "expression": {
                                        "items-var": {
                                            "variable": "$.find-custom-modules.out.items",
                                            "functions": []
                                        }
                                    }
                                },
                                "lambda": {
                                    "expression": {
                                        "AND": [
                                            {
                                                "field": "{{{items-var}}}",
                                                "assertion": "notEmpty"
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        "after-all": {
            "type": "appmixer.utils.test.AfterAll",
            "x": 900,
            "y": 300,
            "version": "1.0.0",
            "source": {
                "in": {
                    "assert-create": ["out"],
                    "assert-get": ["out"],
                    "assert-find": ["out"]
                }
            },
            "config": {
                "properties": {
                    "timeout": 30
                }
            }
        },
        "process-results": {
            "type": "appmixer.utils.test.ProcessE2EResults",
            "x": 1100,
            "y": 300,
            "version": "1.0.0",
            "source": {
                "in": {
                    "after-all": ["out"]
                }
            },
            "config": {
                "properties": {
                    "successStoreId": "64cb41824421780007381f86",
                    "failedStoreId": "64cb41969751560007caf0bf"
                },
                "transform": {
                    "in": {
                        "after-all": {
                            "out": {
                                "type": "json2new",
                                "modifiers": {
                                    "recipients": {},
                                    "testCase": {},
                                    "result": {
                                        "result-var": {
                                            "variable": "$.after-all.out",
                                            "functions": []
                                        }
                                    }
                                },
                                "lambda": {
                                    "recipients": "jirka@client.io",
                                    "testCase": "E2E Zoho/crm - Custom Module Lifecycle",
                                    "result": "{{{result-var}}}"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
```

---

### Flow Summary

| Step | Component | Purpose |
|------|-----------|---------|
| 1 | `OnStart` | Triggers the flow |
| 2 | `CreateCustomModule` | Creates `E2E_Test_Custom_Mod` with singular/plural labels and description |
| 3a | `Assert` (assert-create) | **Branch 1** — Asserts `apiName` is `notEmpty` from creation result |
| 3b | `GetCustomModule` | **Branch 2** — Retrieves the created module using its `apiName` |
| 4b | `Assert` (assert-get) | Asserts `custom_modules` array is `notEmpty` |
| 3c | `FindCustomModules` | **Branch 3** — Searches for modules matching "E2E", sorted by `created_time` desc, `outputType: array` |
| 4c | `Assert` (assert-find) | Asserts `items` array is `notEmpty` |
| 5 | `AfterAll` | Merges all 3 assert branches (timeout: 30s) |
| 6 | `ProcessE2EResults` | Reports test results |

> ⚠️ **Cleanup Note**: No `DeleteCustomModule` component exists in this connector, so the test module `E2E_Test_Custom_Mod` will persist after the test run. Manual cleanup in the Zoho CRM UI may be required.