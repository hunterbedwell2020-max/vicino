import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";
import { captureMobileError } from "../sentry";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: ""
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "Unexpected app error." };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    console.error("AppErrorBoundary", error);
    captureMobileError(error, { boundary: "AppErrorBoundary" });
  }

  private reset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>{this.state.message || "Unexpected app error."}</Text>
          <Pressable style={styles.btn} onPress={this.reset}>
            <Text style={styles.btnText}>Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 16
  },
  card: {
    width: "100%",
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EADCF8",
    padding: 16,
    gap: 10
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
    fontFamily: "Satoshi-Regular"
  },
  body: {
    color: theme.colors.muted,
    fontFamily: "Satoshi-Medium"
  },
  btn: {
    marginTop: 4,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 10
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontFamily: "Satoshi-Regular"
  }
});
