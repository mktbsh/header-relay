import "../../assets/tailwind.css";
import { render } from "solid-js/web";

import { ManageRouter } from "./router";

render(() => <ManageRouter />, document.getElementById("app")!);
