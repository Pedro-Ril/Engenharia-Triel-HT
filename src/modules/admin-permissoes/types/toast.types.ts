export interface ToastState {
  open: boolean;
  variant: "success" | "danger";
  title: string;
  description: string;
}

export type FeedbackHandler = (
  variant: ToastState["variant"],
  title: string,
  description: string
) => void;
