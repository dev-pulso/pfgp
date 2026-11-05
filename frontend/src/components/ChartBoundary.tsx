import { Component, type ReactNode } from "react";

export default class ChartBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="card state-card" role="alert">
          <h2>No se pudieron dibujar los gráficos</h2>
          <p>
            Puedes seguir revisando las tarjetas de indicadores y la tabla de
            episodios.
          </p>
          <button
            className="button secondary"
            onClick={() => this.setState({ failed: false })}
          >
            Reintentar gráficos
          </button>
        </div>
      );
    return this.props.children;
  }
}
